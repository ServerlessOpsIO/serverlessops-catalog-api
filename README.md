# ServerlesOps Catalog API

The home for everything with no better place to go.

This provides a source of truth to be consumed by Backstage for entities that lack their own programatic source. While most entities can have a programatic source of truth, some abstract entities such as Domains and Services do not. Also, some entities may have a programatic source of truth but we don't want to allow Backstage direct access to it. Eg. AWS organization and account info. This API provides us a place to store that information.