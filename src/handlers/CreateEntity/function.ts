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
    DynamoDBServiceException
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

interface Item extends Entity {
    pk: string
    sk: string
    itemType: string
}

export async function putEntity(entity: Entity): Promise<PutItemCommandOutput> {
    let output: PutItemCommandOutput

    const namespace = entity.metadata.namespace
    const kind = entity.kind.toLowerCase()
    const name = entity.metadata.name

    const item: Item = {
        'pk': `${namespace}/${kind}`,
        'sk': `${namespace}/${kind}/${name}`,
        'itemType': 'entity',
        ...entity
    }

    const params: PutItemCommandInput = {
        TableName: DDB_TABLE_NAME,
        Item: marshall(item),
        ConditionExpression: 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
    }

    try {
        const command = new PutItemCommand(params)
        output = await DDB_CLIENT.send(command)
        LOGGER.info('PutItemCommand succeeded', { output })
    } catch (error) {
        LOGGER.error('PutItemCommand failed', {
            error: (<DynamoDBServiceException>error).name,
            message: error
        })
        throw error
    }

    return output
}


export async function handler (event: APIGatewayProxyEvent, _: Context): Promise<APIGatewayProxyResult> {
    LOGGER.info('Received event', { event })

    const entity: Entity = JSON.parse(event.body || '{}')   // Already validated body at Gateway

    let statusCode: number
    let body: string
    try {
        const output = await putEntity(entity)
        statusCode = 201
        body = JSON.stringify({'request_id': output.$metadata.requestId})
    } catch (error) {
        const fault = (<DynamoDBServiceException>error).$fault
        switch (fault) {
            case 'client':
                statusCode = 400
                break;
            default:
                statusCode = 500
                break;
        }
        body = JSON.stringify({
            name: (<Error>error).name,
            message: (<Error>error).message
        })
    }


    return {
        statusCode,
        body
    }
}
