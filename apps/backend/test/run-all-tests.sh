#!/bin/bash
# Comprehensive test runner for payment system

echo "🧪 Running payment system test suite"
echo "===================================="

# Run integration tests for payment lifecycle
echo "📌 Running payment lifecycle integration tests..."
npx jest payment-lifecycle.test.ts --verbose

# Run integration tests for Stripe webhooks
echo "📌 Running Stripe webhook integration tests..."
npx jest stripe-webhook.test.ts --verbose

# Run error handling and recovery tests
echo "📌 Running payment error handling tests..."
npx jest payment-error-recovery.test.ts --verbose

# Run load tests for performance analysis
echo "📌 Running load tests (10 transactions, 5 concurrent)..."
node scripts/load-test-payments.js 10 5

echo "✅ All tests completed!"
