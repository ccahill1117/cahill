#!/usr/bin/env bash
set -euo pipefail

BUCKET="cahill-media-library"
REGION="us-west-2"
FUNCTION_NAME="cahill-library-scanner"
ROLE_NAME="cahill-library-scanner-role"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
LAMBDA_DIR="$ROOT/lambda"
ZIP_PATH="/tmp/cahill-lambda.zip"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

echo "==> Account: $ACCOUNT_ID  Region: $REGION"

# ── 1. IAM role ───────────────────────────────────────────────────────────────

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

if aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
  echo "==> IAM role already exists"
else
  echo "==> Creating IAM role $ROLE_NAME"
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{
        "Effect":"Allow",
        "Principal":{"Service":"lambda.amazonaws.com"},
        "Action":"sts:AssumeRole"
      }]
    }' > /dev/null

  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name "s3-library-rw" \
    --policy-document "{
      \"Version\":\"2012-10-17\",
      \"Statement\":[
        {
          \"Effect\":\"Allow\",
          \"Action\":[\"s3:ListBucket\",\"s3:GetObject\",\"s3:PutObject\"],
          \"Resource\":[
            \"arn:aws:s3:::${BUCKET}\",
            \"arn:aws:s3:::${BUCKET}/*\"
          ]
        },
        {
          \"Effect\":\"Allow\",
          \"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"],
          \"Resource\":\"arn:aws:logs:*:*:*\"
        }
      ]
    }"

  echo "==> Waiting for role to propagate…"
  sleep 12
fi

# ── 2. Package Lambda ─────────────────────────────────────────────────────────

echo "==> Bundling lambda/"
cd "$LAMBDA_DIR"
# Lambda has @aws-sdk built in for Node 20 — no node_modules needed
zip -q "$ZIP_PATH" index.mjs
cd "$ROOT"

# ── 3. Deploy Lambda ──────────────────────────────────────────────────────────

if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &>/dev/null; then
  echo "==> Updating Lambda function code"
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_PATH" \
    --region "$REGION" > /dev/null
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --timeout 300 \
    --memory-size 256 \
    --region "$REGION" > /dev/null
else
  echo "==> Creating Lambda function $FUNCTION_NAME"
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --zip-file "fileb://$ZIP_PATH" \
    --environment "Variables={BUCKET_NAME=$BUCKET}" \
    --timeout 300 \
    --memory-size 256 \
    --region "$REGION" > /dev/null

  # Wait for function to be active
  aws lambda wait function-active \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
fi

LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${FUNCTION_NAME}"

# ── 4. S3 → Lambda trigger ────────────────────────────────────────────────────

echo "==> Granting S3 permission to invoke Lambda"
aws lambda add-permission \
  --function-name "$FUNCTION_NAME" \
  --statement-id "s3-invoke" \
  --action "lambda:InvokeFunction" \
  --principal s3.amazonaws.com \
  --source-arn "arn:aws:s3:::${BUCKET}" \
  --region "$REGION" 2>/dev/null || echo "   (permission already exists)"

echo "==> Configuring S3 event notification"
aws s3api put-bucket-notification-configuration \
  --bucket "$BUCKET" \
  --notification-configuration "{
    \"LambdaFunctionConfigurations\":[{
      \"LambdaFunctionArn\":\"${LAMBDA_ARN}\",
      \"Events\":[\"s3:ObjectCreated:*\"]
    }]
  }"

# ── 5. CORS ───────────────────────────────────────────────────────────────────

echo "==> Setting bucket CORS"
aws s3api put-bucket-cors \
  --bucket "$BUCKET" \
  --cors-configuration "file://$SCRIPT_DIR/bucket-cors.json"

# ── 6. Initial scan ───────────────────────────────────────────────────────────

echo "==> Triggering initial scan (async)…"
aws lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --invocation-type Event \
  /tmp/lambda-out.json > /dev/null
echo "   Scan kicked off — library.json will be ready in ~30 seconds"

echo ""
echo "Done. library.json will appear at:"
echo "  https://${BUCKET}.s3.amazonaws.com/library.json"
