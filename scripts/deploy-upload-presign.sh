#!/usr/bin/env bash
set -euo pipefail

BUCKET="cahill-media-library"
REGION="us-west-2"
FUNCTION_NAME="cahill-upload-presign"
ROLE_NAME="cahill-library-scanner-role"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
LAMBDA_DIR="$ROOT/lambda-upload"
ZIP_PATH="/tmp/cahill-upload-presign.zip"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

echo "==> Account: $ACCOUNT_ID  Region: $REGION"

# ── 1. Upload secret ─────────────────────────────────────────────────────────
# Reuse the existing secret if the function is already deployed, otherwise mint one.

EXISTING_SECRET="$(aws lambda get-function-configuration \
  --function-name "$FUNCTION_NAME" --region "$REGION" \
  --query "Environment.Variables.UPLOAD_SECRET" --output text 2>/dev/null || true)"

if [[ -n "$EXISTING_SECRET" && "$EXISTING_SECRET" != "None" ]]; then
  UPLOAD_SECRET="$EXISTING_SECRET"
  echo "==> Reusing existing UPLOAD_SECRET"
else
  UPLOAD_SECRET="$(openssl rand -hex 24)"
  echo "==> Generated new UPLOAD_SECRET"
fi

# ── 2. Package Lambda (with its own node_modules — presigner isn't guaranteed
#      to be part of the managed Node 20 runtime bundle) ──────────────────────

echo "==> Installing lambda-upload dependencies"
cd "$LAMBDA_DIR"
npm install --omit=dev --no-audit --no-fund > /dev/null
rm -f "$ZIP_PATH"
zip -qr "$ZIP_PATH" index.mjs node_modules package.json
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
    --timeout 10 \
    --memory-size 128 \
    --environment "Variables={BUCKET_NAME=$BUCKET,UPLOAD_SECRET=$UPLOAD_SECRET}" \
    --region "$REGION" > /dev/null
  aws lambda wait function-updated \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
else
  echo "==> Creating Lambda function $FUNCTION_NAME"
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime nodejs20.x \
    --role "$ROLE_ARN" \
    --handler index.handler \
    --zip-file "fileb://$ZIP_PATH" \
    --environment "Variables={BUCKET_NAME=$BUCKET,UPLOAD_SECRET=$UPLOAD_SECRET}" \
    --timeout 10 \
    --memory-size 128 \
    --region "$REGION" > /dev/null

  aws lambda wait function-active \
    --function-name "$FUNCTION_NAME" \
    --region "$REGION"
fi

# ── 4. Function URL (public endpoint, guarded by the shared secret header) ────

echo "==> Configuring Function URL"
if aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" &>/dev/null; then
  aws lambda update-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["POST"],"AllowHeaders":["content-type","x-upload-secret"],"MaxAge":300}' \
    --region "$REGION" > /dev/null
else
  aws lambda create-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["POST"],"AllowHeaders":["content-type","x-upload-secret"],"MaxAge":300}' \
    --region "$REGION" > /dev/null

  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "public-url-invoke" \
    --action "lambda:InvokeFunctionUrl" \
    --principal "*" \
    --function-url-auth-type NONE \
    --region "$REGION" > /dev/null
fi

UPLOAD_URL="$(aws lambda get-function-url-config \
  --function-name "$FUNCTION_NAME" --region "$REGION" \
  --query 'FunctionUrl' --output text)"

echo ""
echo "Done."
echo "  Upload URL    : $UPLOAD_URL"
echo "  Upload secret : $UPLOAD_SECRET"
echo ""
echo "Add these to $ROOT/.env.local (do not commit this file):"
echo "  VITE_UPLOAD_URL=${UPLOAD_URL}"
echo "  VITE_UPLOAD_SECRET=${UPLOAD_SECRET}"
