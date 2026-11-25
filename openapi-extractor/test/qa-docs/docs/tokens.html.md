# Delete Token

````json DELETE /api/v1/tokens/{tokenId}
{
  "openapi": "3.0.1",
  "tags": [
    {
      "name": "Tokens",
      "description": "Token lifecycle"
    }
  ],
  "paths": {
    "/api/v1/tokens/{tokenId}": {
      "delete": {
        "summary": "Revoke API token",
        "tags": ["Tokens"],
        "responses": {
          "204": {
            "description": "Revoked"
          }
        }
      }
    }
  }
}
````
