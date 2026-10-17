#!/bin/bash
set -euo pipefail

export POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name "HouseholdCfoUsers" \
  --policies '{"PasswordPolicy":{"MinimumLength":8}}' \
  --region $REGION | jq -r '.UserPool.Id')

export CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id $POOL_ID \
  --client-name "HouseholdCfoClient" \
  --no-generate-secret \
  --explicit-auth-flows "ALLOW_USER_PASSWORD_AUTH" "ALLOW_REFRESH_TOKEN_AUTH" \
  --region $REGION | jq -r '.UserPoolClient.ClientId')

aws cognito-idp admin-create-user --user-pool-id $POOL_ID --username $USERNAME \
  --region $REGION --message-action SUPPRESS > /dev/null
aws cognito-idp admin-set-user-password --user-pool-id $POOL_ID --username $USERNAME \
  --password $PASSWORD --region $REGION --permanent > /dev/null

export BEARER_TOKEN=$(aws cognito-idp initiate-auth --client-id "$CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=$USERNAME,PASSWORD=$PASSWORD \
  --region $REGION | jq -r '.AuthenticationResult.AccessToken')

export DISCOVERY_URL="https://cognito-idp.$REGION.amazonaws.com/$POOL_ID/.well-known/openid-configuration"
echo "Pool ID: $POOL_ID"
echo "Client ID: $CLIENT_ID"
echo "Discovery URL: $DISCOVERY_URL"