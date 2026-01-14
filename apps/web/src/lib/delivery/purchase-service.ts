/**
 * Purchase Service
 * 
 * Handles photo purchases, cart management, and order processing.
 */

import { createServiceClient } from '@/lib/supabase/server';
import { createEntitlement, Resolution } from './download-service';
import { getPhotographerPlatformFee } from '@/lib/subscription/plans';

// ============================================
// TYPES
// ============================================

export interface CartItem {
  id: string;
  attendeeId: string;
  mediaId: string | null;
  eventId: string;
  digitalProductId: string;
  printProductId: string | null;
  printRegionId: string | null;
  photographerMarkup: number;
  quantity: number;
  unitPrice: number;
  
  // Joined data
  productName?: string;
  productType?: string;
  resolution?: string;
  mediaPreviewUrl?: string;
  eventName?: string;
}

export interface DigitalProduct {
  id: string;
  name: string;
  description: string | null;
  productType: 'single_photo' | 'event_package' | 'all_photos';
  resolution: Resolution;
  includeRaw: boolean;
  defaultPrice: number;
  downloadLimit: number | null;
  expiryDays: number;
}

export interface PhotoPurchase {
  id: string;
  orderNumber: string;
  attendeeId: string;
  photographerId: string;
  eventId: string;
  subtotal: number;
  platformFee: number;
  photographerAmount: number;
  totalAmount: number;
  currency: string;
  paymentProvider: string | null;
  paymentStatus: string;
  paidAt: Date | null;
  status: string;
  createdAt: Date;
  items: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  itemType: 'digital' | 'print';
  mediaId: string | null;
  digitalProductId: string | null;
  resolution: string | null;
  printProductId: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

// ============================================
// GET DIGITAL PRODUCTS
// ============================================

export async function getDigitalProducts(): Promise<DigitalProduct[]> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase
    .from('digital_products')
    .select('*')
    .eq('is_active', true)
    .order('default_price');

  if (error || !data) {
    return [];
  }

  return data.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    productType: row.product_type,
    resolution: row.resolution,
    includeRaw: row.include_raw,
    defaultPrice: row.default_price,
    downloadLimit: row.download_limit,
    expiryDays: row.expiry_days,
  }));
}

// ============================================
// GET EVENT PRICING
// ============================================

export async function getEventPricing(eventId: string): Promise<Map<string, number>> {
  const supabase = createServiceClient();
  
  const { data } = await supabase
    .from('event_pricing')
    .select('digital_product_id, price')
    .eq('event_id', eventId)
    .eq('is_available', true);

  const pricing = new Map<string, number>();
  
  if (data) {
    for (const row of data) {
      pricing.set(row.digital_product_id, row.price);
    }
  }

  return pricing;
}

export async function getProductPriceForEvent(
  productId: string,
  eventId: string,
  defaultPrice: number
): Promise<number> {
  const pricing = await getEventPricing(eventId);
  return pricing.get(productId) ?? defaultPrice;
}

// ============================================
// CART MANAGEMENT
// ============================================

export async function getCart(attendeeId: string): Promise<CartItem[]> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase
    .from('cart_items')
    .select(`
      *,
      digital_product:digital_product_id (
        name,
        product_type,
        resolution
      ),
      media:media_id (
        preview_path,
        thumbnail_path
      ),
      event:event_id (
        name
      )
    `)
    .eq('attendee_id', attendeeId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map(row => ({
    id: row.id,
    attendeeId: row.attendee_id,
    mediaId: row.media_id,
    eventId: row.event_id,
    digitalProductId: row.digital_product_id,
    printProductId: row.print_product_id,
    printRegionId: row.print_region_id,
    photographerMarkup: row.photographer_markup,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    productName: row.digital_product?.name,
    productType: row.digital_product?.product_type,
    resolution: row.digital_product?.resolution,
    mediaPreviewUrl: row.media?.preview_path || row.media?.thumbnail_path,
    eventName: row.event?.name,
  }));
}

export async function addToCart(
  attendeeId: string,
  eventId: string,
  digitalProductId: string,
  mediaId?: string
): Promise<{ success: boolean; cartItemId?: string; error?: string }> {
  const supabase = createServiceClient();
  
  // Get product and price
  const { data: product } = await supabase
    .from('digital_products')
    .select('*')
    .eq('id', digitalProductId)
    .single();

  if (!product) {
    return { success: false, error: 'Product not found' };
  }

  // Get event-specific price if exists
  const price = await getProductPriceForEvent(digitalProductId, eventId, product.default_price);

  // Check if already in cart
  let query = supabase
    .from('cart_items')
    .select('id')
    .eq('attendee_id', attendeeId)
    .eq('event_id', eventId)
    .eq('digital_product_id', digitalProductId);

  if (mediaId) {
    query = query.eq('media_id', mediaId);
  } else {
    query = query.is('media_id', null);
  }

  const { data: existing } = await query.single();

  if (existing) {
    return { success: false, error: 'Already in cart' };
  }

  // Add to cart
  const { data, error } = await supabase
    .from('cart_items')
    .insert({
      attendee_id: attendeeId,
      event_id: eventId,
      digital_product_id: digitalProductId,
      media_id: mediaId || null,
      unit_price: price,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, cartItemId: data.id };
}

export async function removeFromCart(
  attendeeId: string,
  cartItemId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();
  
  const { error } = await supabase
    .from('cart_items')
    .delete()
    .eq('id', cartItemId)
    .eq('attendee_id', attendeeId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function clearCart(attendeeId: string): Promise<void> {
  const supabase = createServiceClient();
  
  await supabase
    .from('cart_items')
    .delete()
    .eq('attendee_id', attendeeId);
}

export async function getCartTotal(attendeeId: string): Promise<{
  subtotal: number;
  itemCount: number;
}> {
  const cart = await getCart(attendeeId);
  
  const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return { subtotal, itemCount };
}

// ============================================
// CREATE PURCHASE
// ============================================

export interface CreatePurchaseOptions {
  attendeeId: string;
  cartItems: CartItem[];
  paymentProvider: string;
  transactionId?: string;
  currency?: string;
}

export async function createPurchase(
  options: CreatePurchaseOptions
): Promise<{ success: boolean; purchase?: PhotoPurchase; error?: string }> {
  const { attendeeId, cartItems, paymentProvider, transactionId, currency = 'USD' } = options;
  
  if (cartItems.length === 0) {
    return { success: false, error: 'Cart is empty' };
  }

  const supabase = createServiceClient();

  // Group by event/photographer for separate orders
  const eventGroups = new Map<string, CartItem[]>();
  for (const item of cartItems) {
    const existing = eventGroups.get(item.eventId) || [];
    existing.push(item);
    eventGroups.set(item.eventId, existing);
  }

  const purchases: PhotoPurchase[] = [];

  for (const [eventId, items] of eventGroups) {
    // Get event photographer
    const { data: event } = await supabase
      .from('events')
      .select('photographer_id')
      .eq('id', eventId)
      .single();

    if (!event) continue;

    const photographerId = event.photographer_id;
    
    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    const platformFeeRate = await getPhotographerPlatformFee(photographerId);
    const platformFee = Math.round(subtotal * platformFeeRate);
    const photographerAmount = subtotal - platformFee;

    // Generate order number
    const { data: orderData } = await supabase.rpc('generate_order_number');
    const orderNumber = orderData || `FF-${Date.now()}`;

    // Create purchase
    const { data: purchase, error: purchaseError } = await supabase
      .from('photo_purchases')
      .insert({
        order_number: orderNumber,
        attendee_id: attendeeId,
        photographer_id: photographerId,
        event_id: eventId,
        subtotal,
        platform_fee: platformFee,
        photographer_amount: photographerAmount,
        total_amount: subtotal, // Payment provider adds their fees on top
        currency,
        payment_provider: paymentProvider,
        payment_status: 'pending',
        status: 'pending',
        transaction_id: transactionId || null,
      })
      .select('*')
      .single();

    if (purchaseError || !purchase) {
      console.error('Failed to create purchase:', purchaseError);
      continue;
    }

    // Create purchase items
    const purchaseItems: PurchaseItem[] = [];
    
    for (const item of items) {
      const { data: purchaseItem, error: itemError } = await supabase
        .from('purchase_items')
        .insert({
          purchase_id: purchase.id,
          item_type: 'digital',
          media_id: item.mediaId,
          digital_product_id: item.digitalProductId,
          resolution: item.resolution,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          total_price: item.unitPrice * item.quantity,
        })
        .select('*')
        .single();

      if (!itemError && purchaseItem) {
        purchaseItems.push({
          id: purchaseItem.id,
          purchaseId: purchaseItem.purchase_id,
          itemType: purchaseItem.item_type,
          mediaId: purchaseItem.media_id,
          digitalProductId: purchaseItem.digital_product_id,
          resolution: purchaseItem.resolution,
          printProductId: purchaseItem.print_product_id,
          quantity: purchaseItem.quantity,
          unitPrice: purchaseItem.unit_price,
          totalPrice: purchaseItem.total_price,
        });
      }
    }

    purchases.push({
      id: purchase.id,
      orderNumber: purchase.order_number,
      attendeeId: purchase.attendee_id,
      photographerId: purchase.photographer_id,
      eventId: purchase.event_id,
      subtotal: purchase.subtotal,
      platformFee: purchase.platform_fee,
      photographerAmount: purchase.photographer_amount,
      totalAmount: purchase.total_amount,
      currency: purchase.currency,
      paymentProvider: purchase.payment_provider,
      paymentStatus: purchase.payment_status,
      paidAt: purchase.paid_at ? new Date(purchase.paid_at) : null,
      status: purchase.status,
      createdAt: new Date(purchase.created_at),
      items: purchaseItems,
    });
  }

  if (purchases.length === 0) {
    return { success: false, error: 'Failed to create purchase' };
  }

  return { success: true, purchase: purchases[0] };
}

// ============================================
// COMPLETE PURCHASE (After payment)
// ============================================

export async function completePurchase(
  purchaseId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceClient();
  
  // Get purchase with items
  const { data: purchase, error: purchaseError } = await supabase
    .from('photo_purchases')
    .select(`
      *,
      items:purchase_items (
        *,
        digital_product:digital_product_id (
          resolution,
          include_raw,
          download_limit,
          expiry_days,
          product_type
        )
      )
    `)
    .eq('id', purchaseId)
    .single();

  if (purchaseError || !purchase) {
    return { success: false, error: 'Purchase not found' };
  }

  // Update purchase status
  const { error: updateError } = await supabase
    .from('photo_purchases')
    .update({
      payment_status: 'succeeded',
      paid_at: new Date().toISOString(),
      status: 'completed',
    })
    .eq('id', purchaseId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Create entitlements for each item
  for (const item of purchase.items) {
    const product = item.digital_product;
    
    if (!product) continue;

    if (product.product_type === 'single_photo' && item.media_id) {
      // Single photo entitlement
      await createEntitlement({
        attendeeId: purchase.attendee_id,
        mediaId: item.media_id,
        entitlementType: 'single_photo',
        resolution: product.resolution,
        includeRaw: product.include_raw,
        purchaseId: purchase.id,
        downloadLimit: product.download_limit,
        expiryDays: product.expiry_days,
      });
    } else if (product.product_type === 'event_package') {
      // Event package - access to all matched photos
      await createEntitlement({
        attendeeId: purchase.attendee_id,
        eventId: purchase.event_id,
        entitlementType: 'event_all',
        resolution: product.resolution,
        includeRaw: product.include_raw,
        purchaseId: purchase.id,
        downloadLimit: product.download_limit,
        expiryDays: product.expiry_days,
      });
    }
  }

  // Credit photographer's wallet
  const { error: creditError } = await supabase
    .from('wallets')
    .update({
      pending_balance: supabase.rpc('increment_balance', {
        amount: purchase.photographer_amount,
      }),
    })
    .eq('photographer_id', purchase.photographer_id);

  if (creditError) {
    console.error('Failed to credit wallet:', creditError);
  }

  // Clear cart items that were purchased
  await supabase
    .from('cart_items')
    .delete()
    .eq('attendee_id', purchase.attendee_id)
    .eq('event_id', purchase.event_id);

  return { success: true };
}

// ============================================
// GET PURCHASE HISTORY
// ============================================

export async function getPurchaseHistory(
  attendeeId: string
): Promise<PhotoPurchase[]> {
  const supabase = createServiceClient();
  
  const { data, error } = await supabase
    .from('photo_purchases')
    .select(`
      *,
      items:purchase_items (*)
    `)
    .eq('attendee_id', attendeeId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map(row => ({
    id: row.id,
    orderNumber: row.order_number,
    attendeeId: row.attendee_id,
    photographerId: row.photographer_id,
    eventId: row.event_id,
    subtotal: row.subtotal,
    platformFee: row.platform_fee,
    photographerAmount: row.photographer_amount,
    totalAmount: row.total_amount,
    currency: row.currency,
    paymentProvider: row.payment_provider,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at ? new Date(row.paid_at) : null,
    status: row.status,
    createdAt: new Date(row.created_at),
    items: row.items.map((item: {
      id: string;
      purchase_id: string;
      item_type: string;
      media_id: string | null;
      digital_product_id: string | null;
      resolution: string | null;
      print_product_id: string | null;
      quantity: number;
      unit_price: number;
      total_price: number;
    }) => ({
      id: item.id,
      purchaseId: item.purchase_id,
      itemType: item.item_type,
      mediaId: item.media_id,
      digitalProductId: item.digital_product_id,
      resolution: item.resolution,
      printProductId: item.print_product_id,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      totalPrice: item.total_price,
    })),
  }));
}

// ============================================
// GIFT PHOTO
// ============================================

export async function giftPhoto(
  photographerId: string,
  attendeeId: string,
  mediaId: string,
  resolution: Resolution,
  message?: string
): Promise<{ success: boolean; error?: string }> {
  return createEntitlement({
    attendeeId,
    mediaId,
    entitlementType: 'gifted',
    resolution,
    giftedBy: photographerId,
    giftMessage: message,
    downloadLimit: 5,
    expiryDays: 365, // 1 year
  });
}
