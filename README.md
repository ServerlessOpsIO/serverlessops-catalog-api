# ServerlesOps Catalog API

The home for everything with no better place to go.

This provides a source of truth to be consumed by Backstage for entities that lack their own programatic source. While most entities can have a programatic source of truth, some abstract entities such as Domains and Services do not.

Additionally, some entities may have a programatic source of truth but we don't want to allow Backstage direct access to it. Eg. AWS organization and account info. This API provides us a place to store that information.

Finally, Every Backstage entity source requires the creation of a provider. By using this service new data can be added to the Backstage catalog without needing to create new providers. A provider for this service can be found at [ServerlessOpsIO/backstage-app/src/plugins/catalog-backend-module-serverlessops-catalog](https://github.com/ServerlessOpsIO/backstage-app/tree/main/src/plugins/catalog-backend-module-serverlessops-catalog).

## API
The API is purposely simple. It provides a way to create, read, update, and delete entities as well as list entities by namespace and kind. It is similar to the Backstage catalog API but with fewer features and capabilities. Only the capabilities for managing entities and those needed for Backstage have been implimented.

The full API can be found in the [OpenAPI document](./openapi.yaml).

### Examples
**List entities by namespace and kind**
```http
GET /catalog/<namespace>/<kind>
```

Example
```http
GET /catalog/default/resource

HTTP/1.1 200 OK
{
  "entities": [
      "default/resource/aws-000000000000",
      "default/resource/aws-000000000001",
      "default/resource/aws-000000000002"
    ]
}
```


**Get entity by path**
```http
GET /catalog/<namespace>/<kind>/<metadata.name>
```

Example
```http
GET /catalog/default/resource/aws-000000000000

HTTP/1.1 200 OK
{
  "spec": {
    "owner": "group:admins",
    "type": "cloud-account"
  },
  "metadata": {
    "namespace": "default",
    "name": "aws-000000000000",
    "description": "Example",
    "annotations": {
      "io.serverlessops/cloud-provider": "aws"
    },
    "links": [
      {
        "icon": "aws",
        "title": "AWS Console",
        "type": "admin-console",
        "url": "https://serverlessops.awsapps.com"
      }
    ],
    "title": "975050136080",
    "tags": [
      "cloud"
    ]
  },
  "apiVersion": "backstage.io/v1alpha1",
  "kind": "Resource"
}
```

## Architecture
This is an AWS serverless service. It is built on top of the following AWS services:
* API Gateway
* Lambda
* DynamoDB
* Cognito (See Authentication and Authorization for more)

## Authentication and Authorization
This service is configured to use a pre-existing Cognito User Pool. Clients should obtain a JWT from the Cognito token endpoint using the client's clientId and clientSecret. Each endpoint's scope requirements are defined in the [OpenAPI document](./openapi.yaml).