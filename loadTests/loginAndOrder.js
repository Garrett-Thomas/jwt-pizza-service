import { sleep, group, check } from 'k6'
import http from 'k6/http'

export const options = {
  cloud: {
    distribution: { 'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 100 } },
    apm: [],
  },
  thresholds: {},
  scenarios: {
    Scenario_1: {
      executor: 'ramping-vus',
      gracefulStop: '30s',
      stages: [
        { target: 5, duration: '30s' },
        { target: 15, duration: '1m' },
        { target: 10, duration: '30s' },
        { target: 0, duration: '30s' },
      ],
      gracefulRampDown: '30s',
      exec: 'scenario_1',
    },
    Scenario_2: {
      executor: 'ramping-vus',
      gracefulStop: '30s',
      stages: [
        { target: 20, duration: '1m' },
        { target: 20, duration: '3m30s' },
        { target: 0, duration: '1m' },
      ],
      gracefulRampDown: '30s',
      exec: 'scenario_2',
    },
  },
}

const FRONTEND = 'https://pizza.garywaters.click'
const SERVICE = 'https://pizza-service.garywaters.click'
const FACTORY = 'https://pizza-factory.cs329.click'

const baseHeaders = {
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  Origin: FRONTEND,
  'Sec-GPC': '1',
  Connection: 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Cache-Control': 'no-cache',
}

function serviceHeaders(host, token, extra = {}) {
  const headers = {
    ...baseHeaders,
    Host: host,
    'Sec-Fetch-Site': host === 'pizza-factory.cs329.click' ? 'cross-site' : 'same-site',
    ...extra,
  }
  if (token) {
    headers['Content-Type'] = 'application/json'
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function preflight(url, method, requestHeaders) {
  const host = url.split('/')[2]
  return http.options(url, null, {
    headers: serviceHeaders(host, null, {
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': requestHeaders,
    }),
  })
}

export function scenario_1() {
  let response

  group('page_1 - https://pizza.garywaters.click/', function () {
    response = http.get(`${FRONTEND}/`, {
      headers: {
        Host: 'pizza.garywaters.click',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Sec-GPC': '1',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        Priority: 'u=0, i',
        'Cache-Control': 'no-cache',
        TE: 'trailers',
      },
    })
    sleep(3)

    // Login: capture the auth token from the response instead of hard-coding it.
    response = http.put(`${SERVICE}/api/auth`, '{"email":"a@jwt.com","password":"admin"}', {
      headers: serviceHeaders('pizza-service.garywaters.click', null, {
        'Content-Type': 'application/json',
      }),
    })
    const loggedIn = check(response, {
      'login status is 200': (r) => r.status === 200,
      'login returned a token': (r) => !!r.json('token'),
    })
    if (!loggedIn) {
      return
    }
    const authToken = response.json('token')

    preflight(`${SERVICE}/api/auth`, 'PUT', 'content-type')
    sleep(5)

    response = http.get(`${SERVICE}/api/order/menu`, {
      headers: serviceHeaders('pizza-service.garywaters.click', authToken),
    })
    preflight(`${SERVICE}/api/order/menu`, 'GET', 'authorization,content-type')

    response = http.get(`${SERVICE}/api/franchise?page=0&limit=20&name=*`, {
      headers: serviceHeaders('pizza-service.garywaters.click', authToken),
    })
    preflight(`${SERVICE}/api/franchise?page=0&limit=20&name=*`, 'GET', 'authorization,content-type')
    sleep(2)

    response = http.get(`${SERVICE}/api/user/me`, {
      headers: serviceHeaders('pizza-service.garywaters.click', authToken),
    })
    preflight(`${SERVICE}/api/user/me`, 'GET', 'authorization,content-type')
    sleep(2.9)

    // Purchase: the response carries the JWT that the factory verify call needs.
    response = http.post(
      `${SERVICE}/api/order`,
      '{"items":[{"menuId":2,"description":"Pepperoni","price":0.0042}],"storeId":"1","franchiseId":1}',
      {
        headers: serviceHeaders('pizza-service.garywaters.click', authToken),
      }
    )
    const purchased = check(response, {
      'purchase status is 200': (r) => r.status === 200,
      'purchase returned a pizza jwt': (r) => !!r.json('jwt'),
    })

    preflight(`${SERVICE}/api/order`, 'POST', 'authorization,content-type')
    sleep(5)

    if (!purchased) {
      return
    }
    const pizzaJwt = response.json('jwt')

    response = http.post(`${FACTORY}/api/order/verify`, JSON.stringify({ jwt: pizzaJwt }), {
      headers: serviceHeaders('pizza-factory.cs329.click', authToken, {
        'Sec-Fetch-Storage-Access': 'none',
      }),
    })
    check(response, {
      'verify status is 200': (r) => r.status === 200,
    })

    preflight(`${FACTORY}/api/order/verify`, 'POST', 'authorization,content-type')
  })
}

export function scenario_2() {
  http.get('https://test.k6.io')
  sleep(1)
}
