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
    GetItemCommand,
    GetItemCommandInput,
    GetItemCommandOutput,
} from '@aws-sdk/client-dynamodb'
import {
    unmarshall
} from '@aws-sdk/util-dynamodb'
import {
    Entity
} from '@backstage/catalog-model'

const LOGGER = new Logger()

const DDB_CLIENT = new DynamoDBClient()
const DDB_TABLE_NAME = process.env.DDB_TABLE_NAME || ''


export async function getEntity(
    namespace: string,
    kind: string,
    name: string
): Promise<Entity> {
    const params: GetItemCommandInput = {
        TableName: DDB_TABLE_NAME,
        Key: {
            'pk': {S: `${namespace}/${kind}`},
            'sk': {S: `${namespace}/${kind}/${name}`}
        },
        ProjectionExpression: 'apiVersion, kind, metadata, spec'
    }

    let output: GetItemCommandOutput
    try {
        const command = new GetItemCommand(params)
        output = await DDB_CLIENT.send(command)
        LOGGER.info('PutItemCommand succeeded', { output })
    } catch (error) {
        LOGGER.error('PutItemCommand failed', { error })
        throw error
    }

    if ( typeof output.Item == 'undefined' ) {
        throw new Error('Entity not found')
    }

    return unmarshall(output.Item) as Entity
}


export async function handler (event: APIGatewayProxyEvent, _: Context): Promise<APIGatewayProxyResult> {
    LOGGER.info('Received event', { event })

    const namespace = event.pathParameters?.namespace as string
    const kind = event.pathParameters?.kind as string
    const name = event.pathParameters?.name as string


    const entity = await getEntity(
        namespace,
        kind,
        name
    )

    return {
        statusCode: 201,
        body: JSON.stringify(entity),
    }
}
