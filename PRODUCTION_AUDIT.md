# FaceFindr Production-Grade Audit Report
**Date:** January 14, 2026  
**Scope:** Complete system-wide audit for production readiness

## Executive Summary

This audit identifies **critical issues** that must be fixed before production launch, particularly around **currency handling**, **fee calculations**, and **pricing consistency**. The system has good architectural foundations but contains several **critical loopholes** that could lead to financial discrepancies, security issues, and user experience problems.

---

## 🔴 CRITICAL ISSUES (Must Fix Before Launch)

### 1. Currency & Pricing Inconsistencies

#### 1.1 Event Pricing Schema Mismatch
**Status:** 🔴 CRITICAL  
**Issue:** 
- `event_pricing` table lacks `bulk_tiers` and `pricing_type` columns
- Settings page allows setting bulk pricing but database doesn't support it
- No validation for bulk tier overlaps
- Pricing type (free/per_photo/bulk) not stored

**Impact:** 
- Photographers can set bulk pricing in UI but it won't be saved
- Checkout flow only supports per-photo or unlock-all
- Bulk pricing completely broken

**Fix Required:**
- Migration to add `pricing_type`, `bulk_tiers` (JSONB) to `event_pricing`
- Update checkout to calculate bulk pricing correctly
- Add validation for tier overlaps

#### 1.2 Fee Calculation Not Using Region/Plan Settings
**Status:** 🔴 CRITICAL  
**Issue:**
- Fees hardcoded in checkout (`0.15` platform fee, `0.029 + 30` Stripe fee)
- Region config has `platform_commission_percent`, `transaction_fee_percent`, `transaction_fee_fixed` but not used
- Photographer's subscription plan not looked up to determine platform fee
- Admin can set fees per region but checkout ignores them

**Current Code:**
```typescript
// apps/web/src/app/api/checkout/route.ts:225
const platformFee = Math.round(totalAmount * 0.15); // HARDCODED!
const providerFee = Math.round(totalAmount * 0.029 + 30); // HARDCODED!
```

**Impact:**
- Platform loses money if admin sets different fees
- Photographers charged wrong fees
- Cannot support regional pricing differences
- Stripe fees vary by country but always calculated for USD

**Fix Required:**
- Lookup photographer's subscription plan
- Get region config for event currency/country
- Calculate platform fee: `max(region.commission_percent, plan.platform_fee)`
- Calculate transaction fee using region settings
- Use Stripe's actual fee structure for currency

---

**Next:** I'll now systematically fix all critical issues, starting with the database migration for bulk pricing, then refactoring the fee calculation system.