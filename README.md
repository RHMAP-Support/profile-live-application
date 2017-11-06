# FeedHenry Hello World Cloud App
[![Dependency Status](https://img.shields.io/david/feedhenry-templates/helloworld-cloud.svg?style=flat-square)](https://david-dm.org/feedhenry-templates/helloworld-cloud)

This is a blank 'hello world' FeedHenry MBaaS. Use it as a starting point for building your APIs. 

# Group Hello World API

# hello [/hello]

'Hello world' endpoint.

## hello [POST] 

+ Request (application/json)
    + Body
            {
              "hello": "world"
            }

+ Response 200 (application/json)
    + Body
            {
              "msg": "Hello world"
            }

## Build
```shell
npm install
```

## Run locally

### Setup MongoDB

In order to run the Hello World server locally you'll need to have [MongoDB](https://www.mongodb.com/) installed and running on your local machine.

Start MongoDB server with:

```shell
mongod
```

The Hello World server will try to access MongoDB on the default port `27017`, if you are running MongoDB on a different port you should set the `FH_MONGODB_CONN_URL` environment variable to the MongoDB connection URL.

### Setup Redis

In order to run the Hellow World server locally you'll need to have [Redis](https://redis.io/) installed and running on your local machine.

Start Redis server with:
```shell
redis-server /usr/local/etc/redis.conf
```

### Start the server

```shell
npm run serve
```

The Hello World server will be availble at `localhost:8001`.

If you wish to run the server on a different port you should set the `FH_PORT`
environment variable to the port you want the server to run on.

## Debug

```shell
npm run debug
```

Visit http://127.0.0.1:8080/?port=5858 to start debugging.

## Development

See [Cloud Development](http://docs.feedhenry.com/v2/cloud_development.html) page about how to develop cloud app.

## Tests

All the tests are in the "test/" directory. The cloud app is using mocha as the test runner.

### Unit and acceptance tests

* all the tests:

With [MongoDB](#setup-mongodb) and [Redis](#setup-redis) running

```shell
npm test
```

* unit tests:

```shell
npm run unit
```
* acceptance tests:

With [MongoDB](#setup-mongodb) and [Redis](#setup-redis) running

```shell
npm run accept
```

### Code coverage

```shell
npm run coverage
```

* coverage report for unit tests:

```shell
npm run coverage-unit
```
* coverage report for acceptance tests:

```shell
npm run coverage-accept
```

## Source code analysis

To get Plato's JavaScript source code visualization, static analysis, and complexity report:

```shell
npm run analysis
```