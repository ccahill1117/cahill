#!/usr/bin/env bash
set -euo pipefail

BUCKET="cahill-media-library"
REGION="us-west-2"
FUNCTION_NAME="cahill-library-scanner"
ROLE_NAME="cahill-library-scanner-role"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

echo "==> Account: $ACCOUNT_ID  Region: $REGION"

# ── 1. CloudFront response headers policy (CORS) ──────────────────────────────

echo "==> Creating CORS response headers policy"
CORS_POLICY_ID="$(aws cloudfront create-response-headers-policy \
  --response-headers-policy-config '{
    "Name": "cahill-cors-allow-all",
    "CorsConfig": {
      "AccessControlAllowOrigins": {"Quantity":1,"Items":["*"]},
      "AccessControlAllowHeaders": {"Quantity":1,"Items":["*"]},
      "AccessControlAllowMethods": {"Quantity":2,"Items":["GET","HEAD"]},
      "AccessControlAllowCredentials": false,
      "OriginOverride": true
    }
  }' \
  --query 'ResponseHeadersPolicy.Id' --output text 2>/dev/null)" || true

# If it already exists, look it up
if [[ -z "$CORS_POLICY_ID" ]]; then
  CORS_POLICY_ID="$(aws cloudfront list-response-headers-policies \
    --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='cahill-cors-allow-all'].ResponseHeadersPolicy.Id" \
    --output text)"
fi

echo "   CORS policy: $CORS_POLICY_ID"

# ── 2. CloudFront distribution ────────────────────────────────────────────────

echo "==> Creating CloudFront distribution (this takes ~2 min to deploy globally)"

CF_ORIGIN="cahill-media-library.s3.us-west-2.amazonaws.com"

DIST_JSON="$(aws cloudfront create-distribution --distribution-config "{
  \"CallerReference\": \"cahill-$(date +%s)\",
  \"Comment\": \"cahill media library CDN\",
  \"Enabled\": true,
  \"HttpVersion\": \"http2and3\",
  \"Origins\": {
    \"Quantity\": 1,
    \"Items\": [{
      \"Id\": \"s3-cahill\",
      \"DomainName\": \"${CF_ORIGIN}\",
      \"S3OriginConfig\": {\"OriginAccessIdentity\": \"\"}
    }]
  },
  \"DefaultCacheBehavior\": {
    \"TargetOriginId\": \"s3-cahill\",
    \"ViewerProtocolPolicy\": \"redirect-to-https\",
    \"AllowedMethods\": {\"Quantity\":2,\"Items\":[\"GET\",\"HEAD\"],\"CachedMethods\":{\"Quantity\":2,\"Items\":[\"GET\",\"HEAD\"]}},
    \"Compress\": true,
    \"CachePolicyId\": \"658327ea-f89d-4fab-a63d-7e88639e58f6\",
    \"ResponseHeadersPolicyId\": \"${CORS_POLICY_ID}\"
  },
  \"CacheBehaviors\": {
    \"Quantity\": 1,
    \"Items\": [{
      \"PathPattern\": \"/library.json\",
      \"TargetOriginId\": \"s3-cahill\",
      \"ViewerProtocolPolicy\": \"redirect-to-https\",
      \"AllowedMethods\": {\"Quantity\":2,\"Items\":[\"GET\",\"HEAD\"],\"CachedMethods\":{\"Quantity\":2,\"Items\":[\"GET\",\"HEAD\"]}},
      \"Compress\": true,
      \"CachePolicyId\": \"4135ea2d-6df8-44a3-9df3-4b5a84be39ad\",
      \"ResponseHeadersPolicyId\": \"${CORS_POLICY_ID}\"
    }]
  }
}")"

CF_DOMAIN="$(echo "$DIST_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Distribution']['DomainName'])")"
DIST_ID="$(echo "$DIST_JSON"   | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['Distribution']['Id'])")"

echo "   Domain: $CF_DOMAIN"
echo "   Dist ID: $DIST_ID"

# ── 3. Update Lambda IAM to allow CF invalidations ───────────────────────────

echo "==> Updating Lambda IAM policy"
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
        \"Action\":\"cloudfront:CreateInvalidation\",
        \"Resource\":\"arn:aws:cloudfront::${ACCOUNT_ID}:distribution/${DIST_ID}\"
      },
      {
        \"Effect\":\"Allow\",
        \"Action\":[\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"],
        \"Resource\":\"arn:aws:logs:*:*:*\"
      }
    ]
  }"

# ── 4. Update Lambda env vars ─────────────────────────────────────────────────

echo "==> Updating Lambda environment"
aws lambda update-function-configuration \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --environment "Variables={BUCKET_NAME=$BUCKET,CLOUDFRONT_DOMAIN=$CF_DOMAIN,DISTRIBUTION_ID=$DIST_ID}" \
  > /dev/null

# ── 5. Write frontend env ─────────────────────────────────────────────────────

echo "==> Writing .env.local"
cat > "$ROOT/.env.local" <<EOF
VITE_CDN_URL=https://${CF_DOMAIN}
EOF

# ── 6. Initial scan via Lambda ────────────────────────────────────────────────

echo "==> Triggering library scan (async)…"
aws lambda invoke \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --invocation-type Event \
  /tmp/lambda-out.json > /dev/null
echo "   Scan kicked off — library.json ready in ~90s"

echo ""
echo "Done."
echo "  CDN URL : https://${CF_DOMAIN}"
echo "  Dist ID : ${DIST_ID}"
echo ""
echo "Note: CloudFront takes ~5 min to finish deploying globally."
echo "Run 'npm run dev' to pick up the new VITE_CDN_URL."
