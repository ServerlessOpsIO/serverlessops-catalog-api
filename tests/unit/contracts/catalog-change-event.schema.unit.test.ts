import { describe, expect, it } from '@jest/globals'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateCatalogChangeEvent } from '../../support/catalog-change-event-schema.js'

const fixtures = ['create-event.json', 'update-event.json', 'delete-event.json']

function readFixture(name: string) {
  return JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        'specs/001-publish-catalog-events/contracts/fixtures',
        name,
      ),
      'utf8',
    ),
  )
}

describe('catalog change event schema', () => {
  it.each(fixtures)('accepts the %s fixture', fixture => {
    expect(validateCatalogChangeEvent(readFixture(fixture))).toBe(true)
  })

  it('continues to accept legacy Backstage entity payloads', () => {
    const event = readFixture('create-event.json')
    event.entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'payments-api', namespace: 'default' },
    }

    expect(validateCatalogChangeEvent(event)).toBe(true)
  })

  it('rejects unsupported change types', () => {
    const event = readFixture('create-event.json')
    event.changeType = 'archive'

    expect(validateCatalogChangeEvent(event)).toBe(false)
  })

  it.each(['legacy entity', 'DynamoDB image'])(
    'requires metadata.name for a %s',
    representation => {
      const event = readFixture('create-event.json')

      if (representation === 'legacy entity') {
        delete event.entity.metadata.M
        event.entity.metadata = {}
      } else {
        delete event.entity.metadata.M.name
      }

      expect(validateCatalogChangeEvent(event)).toBe(false)
    },
  )
})
