import { afterEach, describe, expect, it } from '@jest/globals'
import { mockClient } from 'aws-sdk-client-mock'
import { DeleteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { APIGatewayProxyEvent, Context } from 'aws-lambda'
import { handler } from './function.js'

const dynamoDbMock = mockClient(DynamoDBClient)

afterEach(() => {
  dynamoDbMock.reset()
})

describe('DeleteEntity handler', () => {
  it('returns a failed response without a committed delete when DynamoDB fails', async () => {
    dynamoDbMock.on(DeleteItemCommand).rejects(new Error('database unavailable'))
    const event = {
      body: null,
      pathParameters: {
        namespace: 'default',
        kind: 'component',
        name: 'payments-api',
      },
    } as unknown as APIGatewayProxyEvent

    const response = await handler(event, { awsRequestId: 'request-1' } as Context)

    expect(response.statusCode).toBe(500)
    expect(dynamoDbMock.commandCalls(DeleteItemCommand)).toHaveLength(1)
  })
})
