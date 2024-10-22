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

export async function putEntity(entity: Entity, upsert: boolean): Promise<void> {

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
    }

    if (!upsert) {
        params.ConditionExpression = 'attribute_not_exists(pk) AND attribute_not_exists(sk)'
    }

    try {
        const command = new PutItemCommand(params)
        const output = await DDB_CLIENT.send(command)
        LOGGER.debug('PutItemCommand succeeded', { output })
    } catch (error) {
        LOGGER.error({
            name: (<DynamoDBServiceException>error).name,
            message: (<DynamoDBServiceException>error).message,
            error: <DynamoDBServiceException>error,
        })
        throw error
    }
}


export async function handler_create (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    LOGGER.debug('Received event', { event })
    const event_id = context.awsRequestId

    const entity: Entity = JSON.parse(event.body || '{}')   // Already validated body at Gateway

    let statusCode: number
    let body: string
    try {
        await putEntity(entity, false)
        statusCode = 201
        body = JSON.stringify({'request_id': event_id})
    } catch (error) {
        LOGGER.error("Operation failed", { event })
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

export async function handler_upsert (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    LOGGER.debug('Received event', { event })
    const event_id = context.awsRequestId

    const entity: Entity = JSON.parse(event.body || '{}')   // Already validated body at Gateway

    // Upsert data must match request path
    const namespace = entity.metadata.namespace
    const kind = entity.kind.toLowerCase()
    const name = entity.metadata.name

    if (
        namespace !== event.pathParameters?.namespace ||
        kind !== event.pathParameters?.kind ||
        name !== event.pathParameters?.name
    ) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                name: 'BadRequest',
                message: 'Entity metadata does not match request path'
            })
        }
    }

    let statusCode: number
    let body: string
    try {
        await putEntity(entity, true)
        statusCode = 200
        body = JSON.stringify({'request_id': event_id})
    } catch (error) {
        LOGGER.error("Operation failed", { event })
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