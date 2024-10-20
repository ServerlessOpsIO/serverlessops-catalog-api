import {
    APIGatewayProxyEvent,
    APIGatewayProxyResult,
    Context
} from 'aws-lambda'
import {
    Logger
} from '@aws-lambda-powertools/logger'
import {
    DynamoDBClient,
    PutItemCommand,
    PutItemCommandInput,
    PutItemCommandOutput,
} from '@aws-sdk/client-dynamodb'
import {
    marshall
} from '@aws-sdk/util-dynamodb'

import {
    Entity
} from '@backstage/catalog-model'

const LOGGER = new Logger()

const DDB_CLIENT = new DynamoDBClient()
const DDB_TABLE_NAME = process.env.DDB_TABLE_NAME || ''

export async function putEntity(entity: Entity): Promise<PutItemCommandOutput> {
    let output: PutItemCommandOutput

    const params: PutItemCommandInput = {
        TableName: DDB_TABLE_NAME,
        Item: marshall(entity)
    }

    try {
        const command = new PutItemCommand(params)
        output = await DDB_CLIENT.send(command)
        LOGGER.info('PutItemCommand succeeded', { output })
    } catch (error) {
        LOGGER.error('PutItemCommand failed', { error })
        throw error
    }

    return output
}


export async function handler (event: APIGatewayProxyEvent, _: Context): Promise<APIGatewayProxyResult> {
    LOGGER.info('Received event', { event })

    const entity: Entity = JSON.parse(event.body || '{}')   // Already validated body at Gateway
    const output = await putEntity(entity)

    return {
        statusCode: 201,
        body: JSON.stringify({'request_id': output.$metadata.requestId}),
    }
}
