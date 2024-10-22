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
    DeleteItemCommand,
    DeleteItemCommandInput,
    DynamoDBServiceException
} from '@aws-sdk/client-dynamodb'

const LOGGER = new Logger()

const DDB_CLIENT = new DynamoDBClient()
const DDB_TABLE_NAME = process.env.DDB_TABLE_NAME || ''


export async function deleteEntity(
    namespace: string,
    kind: string,
    name: string
): Promise<void> {
    const params: DeleteItemCommandInput = {
        TableName: DDB_TABLE_NAME,
        Key: {
            'pk': {S: `${namespace}/${kind}`},
            'sk': {S: `${namespace}/${kind}/${name}`}
        }
    }

    try {
        const command = new DeleteItemCommand(params)
        const output = await DDB_CLIENT.send(command)
        LOGGER.debug('DeleteItemCommand succeeded', { output })
    } catch (error) {
        LOGGER.error({
            error: <DynamoDBServiceException>error,
            name: (<DynamoDBServiceException>error).name,
            message: (<DynamoDBServiceException>error).message,
        })
        throw error
    }
}


export async function handler (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    LOGGER.debug('Received event', { event })
    const event_id = context.awsRequestId

    const namespace = event.pathParameters?.namespace as string
    const kind = event.pathParameters?.kind as string
    const name = event.pathParameters?.name as string

    let statusCode: number
    let body: string
    try {
        await deleteEntity(
            namespace,
            kind,
            name
        )
        statusCode = 200
        body = JSON.stringify({"request_id": event_id})
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
