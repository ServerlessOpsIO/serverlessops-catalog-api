import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_SCHEMA, Type, load } from 'js-yaml'

interface SamResource {
  Type: string
  Properties?: Record<string, unknown>
}

export interface SamTemplate {
  Resources: Record<string, SamResource>
}

const cloudFormationSchema = DEFAULT_SCHEMA.extend([
  new Type('!Ref', {
    kind: 'scalar',
    construct: value => ({ Ref: value }),
  }),
  new Type('!GetAtt', {
    kind: 'scalar',
    construct: value => ({ 'Fn::GetAtt': value.split('.') }),
  }),
  new Type('!Sub', {
    kind: 'scalar',
    construct: value => ({ 'Fn::Sub': value }),
  }),
])

export function loadSamTemplate(
  path = resolve(process.cwd(), 'template.yaml'),
): SamTemplate {
  const template = load(readFileSync(path, 'utf8'), {
    schema: cloudFormationSchema,
  })

  if (
    typeof template !== 'object'
    || template === null
    || !('Resources' in template)
    || typeof template.Resources !== 'object'
    || template.Resources === null
  ) {
    throw new Error(`Invalid SAM template at ${path}`)
  }

  return template as SamTemplate
}

export function getSamResource(
  template: SamTemplate,
  logicalId: string,
): SamResource {
  const resource = template.Resources[logicalId]
  if (!resource) {
    throw new Error(`SAM resource "${logicalId}" was not found`)
  }
  return resource
}

export function getSamResourcesByType(
  template: SamTemplate,
  resourceType: string,
): Array<[string, SamResource]> {
  return Object.entries(template.Resources).filter(
    ([, resource]) => resource.Type === resourceType,
  )
}
