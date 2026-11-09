import { afterEach, describe, expect, it } from '@jest/globals'
import { mockClient } from 'aws-sdk-client-mock'
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { handler_create, handler_upsert } from './function.js'

const dynamoDbMock = mockClient(DynamoDBClient)
const entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'payments-api',
    namespace: 'default',
  },
  spec: {
    type: 'service',
    owner: 'payments-team',
  },
}

function createEvent(
  body: unknown,
  pathParameters?: Record<string, string>,
): APIGatewayProxyEvent {
  return {
    body: JSON.stringify(body),
    pathParameters: pathParameters ?? null,
  } as APIGatewayProxyEvent
}

function createContext(): Context {
  return { awsRequestId: 'request-1' } as Context
}

afterEach(() => {
  dynamoDbMock.reset()
})

describe('CreateEntity handlers', () => {
  it('does not write or publish an unchanged upsert', async () => {
    dynamoDbMock.on(GetItemCommand).resolves({
      Item: marshall({
        ...entity,
        pk: 'default/component',
        sk: 'default/component/payments-api',
        itemType: 'entity',
      }),
    })

    const response = await handler_upsert(
      createEvent(entity, {
        namespace: 'default',
        kind: 'component',
        name: 'payments-api',
      }),
      createContext(),
    )

    expect(response.statusCode).toBe(200)
    expect(dynamoDbMock.commandCalls(GetItemCommand)[0]?.args[0].input.ConsistentRead)
      .toBe(true)
    expect(dynamoDbMock.commandCalls(PutItemCommand)).toHaveLength(0)
  })

  it('writes an upsert when the entity changes', async () => {
    dynamoDbMock.on(GetItemCommand).resolves({
      Item: marshall({
        ...entity,
        spec: { ...entity.spec, owner: 'previous-team' },
        pk: 'default/component',
        sk: 'default/component/payments-api',
        itemType: 'entity',
      }),
    })
    dynamoDbMock.on(PutItemCommand).resolves({})

    const response = await handler_upsert(
      createEvent(entity, {
        namespace: 'default',
        kind: 'component',
        name: 'payments-api',
      }),
      createContext(),
    )

    expect(response.statusCode).toBe(200)
    expect(dynamoDbMock.commandCalls(PutItemCommand)).toHaveLength(1)
  })

  it('returns a failed response when the create write fails', async () => {
    dynamoDbMock.on(PutItemCommand).rejects(new Error('database unavailable'))

    const response = await handler_create(createEvent(entity), createContext())

    expect(response.statusCode).toBe(500)
    expect(dynamoDbMock.commandCalls(PutItemCommand)).toHaveLength(1)
  })
})
