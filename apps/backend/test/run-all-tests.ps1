# PowerShell script for running comprehensive payment system tests

Write-Host "🧪 Running payment system test suite" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Run integration tests for payment lifecycle
Write-Host "📌 Running payment lifecycle integration tests..." -ForegroundColor Yellow
npx jest payment-lifecycle.test.ts --verbose

# Run integration tests for Stripe webhooks
Write-Host "📌 Running Stripe webhook integration tests..." -ForegroundColor Yellow
npx jest stripe-webhook.test.ts --verbose

# Run error handling and recovery tests
Write-Host "📌 Running payment error handling tests..." -ForegroundColor Yellow
npx jest payment-error-recovery.test.ts --verbose

# Run load tests for performance analysis (with smaller numbers for initial test)
Write-Host "📌 Running load tests (10 transactions, 5 concurrent)..." -ForegroundColor Yellow
node scripts/load-test-payments.js 10 5

Write-Host "✅ All tests completed!" -ForegroundColor Green
