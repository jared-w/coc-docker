/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict'

import { CompletionItem, CompletionItemKind } from "vscode-languageserver-protocol"
import { request, RequestOptions } from 'https'

const pkg = require('../../package.json')

export class SuggestSupportHelper {
  public async suggestImages(word: string): Promise<CompletionItem[]> {
    const results = await searchImagesInRegistryHub(word, true);

    return results.map((image) => {
      const stars = image.star_count > 0
        ? ` ${image.star_count} ${image.star_count > 1 ? 'stars' : 'star'}`
        : '';

      return {
        label: image.name,
        kind: CompletionItemKind.Value,
        detail: tagsForImage(image) + stars,
        insertText: image.name,
        documentation: image.description,
      };
    });
  }
}

function tagsForImage(image: IHubSearchResponseResult): string {
  let tags: string[] = []
  if (image.is_automated) {
    tags.push('Automated')
  } else if (image.is_trusted) {
    tags.push('Trusted')
  } else if (image.is_official) {
    tags.push('Official')
  }

  return tags.map(t => `[${t}]`).join(' ')
}

const popular = [
  { "is_automated": false, "name": "redis",            "is_trusted": false, "is_official": true,  "star_count": 1300, "description": "Redis is an open source key-value store that functions as a data structure server." },
  { "is_automated": false, "name": "ubuntu",           "is_trusted": false, "is_official": true,  "star_count": 2600, "description": "Ubuntu is a Debian-based Linux operating system based on free software." },
  { "is_automated": false, "name": "wordpress",        "is_trusted": false, "is_official": true,  "star_count": 582,  "description": "The WordPress rich content management system can utilize plugins, widgets, and themes." },
  { "is_automated": false, "name": "mysql",            "is_trusted": false, "is_official": true,  "star_count": 1300, "description": "MySQL is a widely used, open-source relational database management system (RDBMS)." },
  { "is_automated": false, "name": "mongo",            "is_trusted": false, "is_official": true,  "star_count": 1100, "description": "MongoDB document databases provide high availability and easy scalability." },
  { "is_automated": false, "name": "centos",           "is_trusted": false, "is_official": true,  "star_count": 1600, "description": "The official build of CentOS." },
  { "is_automated": false, "name": "node",             "is_trusted": false, "is_official": true,  "star_count": 1200, "description": "Node.js is a JavaScript-based platform for server-side and networking applications." },
  { "is_automated": false, "name": "nginx",            "is_trusted": false, "is_official": true,  "star_count": 1600, "description": "Official build of Nginx." },
  { "is_automated": false, "name": "postgres",         "is_trusted": false, "is_official": true,  "star_count": 1200, "description": "The PostgreSQL object-relational database system provides reliability and data integrity." },
  { "is_automated": true , "name": "microsoft/aspnet", "is_trusted": true , "is_official": false, "star_count": 277,  "description": "ASP.NET is an open source server-side Web application framework" }
]

async function searchImagesInRegistryHub(prefix: string, cache: boolean): Promise<IHubSearchResponseResult[]> {
  if (prefix.length === 0) {
    // return the popular images if user invoked intellisense
    // right after typing the keyword and ':' (e.g. 'image:').
    return Promise.resolve(popular.slice(0))
  }

  // Do an image search on Docker hub and return the results
  const data = await invokeHubSearch(prefix, 100, cache)

  return data.results
}

// https://registry.hub.docker.com/v1/search?q=redis&n=1
// {
//     "num_pages": 10,
//     "num_results": 10,
//     "results": [
//         {
//             "is_automated": false,
//             "name": "redis",
//             "is_trusted": false,
//             "is_official": true,
//             "star_count": 830,
//             "description": "Redis is an open source key-value store that functions as a data structure server."
//         }
//     ],
//     "page_size": 1,
//     "query": "redis",
//     "page": 1
// }
function invokeHubSearch(imageName: string, count: number, cache: boolean): Promise<IHubSearchResponse> {
  // https://registry.hub.docker.com/v1/search?q=redis&n=1
  return fetchHttpsJson<IHubSearchResponse>(
    {
      hostname: 'registry.hub.docker.com',
      port: 443,
      path: '/v1/search?q=' + encodeURIComponent(imageName) + '&n=' + count,
      method: 'GET',
    },
    cache)
}

interface IHubSearchResponse {
  num_pages: number
  num_results: number
  results: [IHubSearchResponseResult]
  page_size: number
  query: string
  page: number
}

export interface IHubSearchResponseResult {
  is_automated: boolean
  name: string
  is_trusted: boolean
  is_official: boolean
  star_count: number
  description: string
}

// tslint:disable-next-line:no-any
let JSON_CACHE: { [key: string]: Promise<any> } = {}

function fetchHttpsJson<T>(opts: RequestOptions, cache: boolean): Promise<T> {
  if (!cache) {
    return doFetchHttpsJson(opts)
  }

  let cache_key = (opts.method + ' ' + opts.hostname + ' ' + opts.path)
  if (!JSON_CACHE[cache_key]) {
    JSON_CACHE[cache_key] = doFetchHttpsJson(opts)
  }

  // new promise to avoid cancelling
  return new Promise<T>((resolve, reject) => {
    JSON_CACHE[cache_key].then(resolve, reject)
  })
}

async function doFetchHttpsJson<T>(opts: RequestOptions): Promise<T> {
  opts.headers = opts.headers || {}
  opts.headers.Accept = 'application/json'
  const data = await httpsRequest(opts);

  return JSON.parse(data);
}

async function httpsRequest(opts: RequestOptions): Promise<string> {
  opts.headers = { ...opts.headers,
    'User-Agent': `coc-docker/${pkg.version}`
  }

  return new Promise<string>((resolve, reject) => {
    let req = request(opts, (res) => {
      let data = ''
      res.on('data', (d: string) => data += d)
      res.on('end', () => resolve(data))
    })
    req.end()
    req.on('error', reject)
  })
}
