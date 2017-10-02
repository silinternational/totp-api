# totp-api
Simple standalone API for creating and validating TOTP codes

## Basic Workflow

- A consumer of this API does a `POST` to `/api-key`, providing an email
  address.
  * NOTE: To keep this API from being wide open to anyone, we protect our
    endpoints at/under `/api-key` with API Gateway's built-in api keys, which
    must be provided as an `x-api-key` header in the HTTP request.
- We create a new API Key and email it to that email address.
- The consumer does a `POST` to `/api-key/activate`, providing the email address
  and the API Key.
- We respond with an API Secret (which is actually an AES key, which we will use
  for encrypting their TOTP Keys).
- The consumer does a `POST` to `/totp`, providing their API Key and API Secret
  in the headers.
- We respond with a UUID, TOTP key, and QR Code, and we encrypt that TOTP key
  using the API Secret, storing the result.
- The consumer at some point does a `POST` to `/totp/{uuid}/validate`, providing
  their API Key and API Secret in the headers and the 6-digit code in the body.
- We get the TOTP records we have for that API Key, retrieve the one with the
  given UUID, use the API Secret to decrypt that TOTP key, and use it to
  generate a 6-digit code to compare to the one we were given.

For details about the various API endpoints, see
[the RAML file](https://github.com/silinternational/totp-api/blob/master/api.raml).

## Continuous Integration / Continuous Deployment (CI/CD)

To set this up on Codeship, do the following:

- Create a Codeship Basic project.
- Give it a Setup Command of `./codeship/setup.sh`
- Give it a Test Command of `./codeship/test.sh`
- Create a Deployment Pipeline for the `develop` branch with this command:
  `./codeship/deploy-dev.sh`
- Create a Deployment Pipeline for the `master` branch with this command:
  `./codeship/deploy-prod.sh`
- Provide `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` environment variables
  with the credentials of the AWS IAM user that Serverless (running on Codeship)
  should act as when deploying this API.

## Glossary

- `API Key`: A hex string used to identify calls to most of the endpoints on
  this API. We store a copy of this in the database.
- `API Secret`: A base-64 encoded random value used to encrypt/decrypt the
  consumer's TOTP Key(s). We do **NOT** store a copy of this (currently... see
  [Issue #3](https://github.com/silinternational/totp-api/issues/3)).
- `TOTP Key`: The secret used for generating TOTP values. This is provided to
  the consumer of this API for them to show as a string / QR Code to their end
  user. We store an encrypted copy of this (encrypted using the API Secret) so
  that when we need to verify given 6-digit code, we can do so.
