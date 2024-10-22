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
    DeleteItemCommandOutput,
    DynamoDBServiceException
} from '@aws-sdk/client-dynamodb'

const LOGGER = new Logger()

const DDB_CLIENT = new DynamoDBClient()
const DDB_TABLE_NAME = process.env.DDB_TABLE_NAME || ''


export async function deleteEntity(
    namespace: string,
    kind: string,
    name: string
): Promise<DeleteItemCommandOutput> {
    let output: DeleteItemCommandOutput

    const params: DeleteItemCommandInput = {
        TableName: DDB_TABLE_NAME,
        Key: {
            'pk': {S: `${namespace}/${kind}`},
            'sk': {S: `${namespace}/${kind}/${name}`}
        }
    }

    try {
        const command = new DeleteItemCommand(params)
        output = await DDB_CLIENT.send(command)
        LOGGER.info('DeleteItemCommand succeeded', { output })
    } catch (error) {
        LOGGER.error('DeleteItemCommand failed', {
            error: (<DynamoDBServiceException>error).name,
            message: error
         })
        throw error
    }

    return output
}


export async function handler (event: APIGatewayProxyEvent, _: Context): Promise<APIGatewayProxyResult> {
    LOGGER.info('Received event', { event })

    const namespace = event.pathParameters?.namespace as string
    const kind = event.pathParameters?.kind as string
    const name = event.pathParameters?.name as string

    let statusCode: number
    let body: string
    try {
        const output = await deleteEntity(
            namespace,
            kind,
            name
        )
        statusCode = 200
        body = JSON.stringify({'request_id':output.$metadata.requestId})
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
        body = JSON.stringify({error: (<Error>error).message})
    }

    return {
        statusCode,
        body
    }
}
