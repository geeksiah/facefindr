'use client';

import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Package,
  DollarSign,
  Image,
  Frame,
  Ruler,
  X,
  Check,
} from 'lucide-react';
import { useState, useEffect } from 'react';

import { formatCurrency } from '@/lib/utils';

interface PrintProduct {
  id: string;
  name: string;
  type: 'print' | 'canvas' | 'frame' | 'other';
  description: string;
  base_price_usd: number;
  sizes: PrintSize[];
  is_active: boolean;
  created_at: string;
}

interface PrintSize {
  id: string;
  name: string;
  width: number;
  height: number;
  unit: 'inches' | 'cm';
  price_modifier: number; // Percentage modifier from base price
}

interface FormData {
  name: string;
  type: 'print' | 'canvas' | 'frame' | 'other';
  description: string;
  base_price_usd: number;
  is_active: boolean;
  sizes: PrintSize[];
}

const productTypes = [
  { value: 'print', label: 'Photo Print', icon: Image },
  { value: 'canvas', label: 'Canvas Print', icon: Frame },
  { value: 'frame', label: 'Framed Print', icon: Frame },
  { value: 'other', label: 'Other Product', icon: Package },
];

const defaultSizes: PrintSize[] = [
  { id: '1', name: '4x6', width: 4, height: 6, unit: 'inches', price_modifier: 0 },
  { id: '2', name: '5x7', width: 5, height: 7, unit: 'inches', price_modifier: 20 },
  { id: '3', name: '8x10', width: 8, height: 10, unit: 'inches', price_modifier: 50 },
  { id: '4', name: '11x14', width: 11, height: 14, unit: 'inches', price_modifier: 100 },
  { id: '5', name: '16x20', width: 16, height: 20, unit: 'inches', price_modifier: 200 },
];

export default function PrintProductsPage() {
  const [products, setProducts] = useState<PrintProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<PrintProduct | null>(null);
  const [activeTab, setActiveTab] = useState<'products' | 'sizes'>('products');

  const [formData, setFormData] = useState<FormData>({
    name: '',
    type: 'print',
    description: '',
    base_price_usd: 0,
    is_active: true,
    sizes: [],
  });

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const res = await fetch('/api/admin/print-products');
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      name: '',
      type: 'print',
      description: '',
      base_price_usd: 0,
      is_active: true,
      sizes: [],
    });
    setEditingProduct(null);
  }

  function openCreateModal() {
    resetForm();
    setShowModal(true);
  }

  function openEditModal(product: PrintProduct) {
    setFormData({
      name: product.name,
      type: product.type,
      description: product.description,
      base_price_usd: product.base_price_usd / 100,
      is_active: product.is_active,
      sizes: product.sizes || [],
    });
    setEditingProduct(product);
    setShowModal(true);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        base_price_usd: Math.round(formData.base_price_usd * 100),
      };

      const url = editingProduct
        ? `/api/admin/print-products/${editingProduct.id}`
        : '/api/admin/print-products';

      const res = await fetch(url, {
        method: editingProduct ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setShowModal(false);
        resetForm();
        loadProducts();
      }
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(productId: string) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
      const res = await fetch(`/api/admin/print-products/${productId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadProducts();
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }

  async function toggleActive(productId: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/admin/print-products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      if (res.ok) {
        loadProducts();
      }
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  }

  function addSize() {
    const newId = `new-${Date.now()}`;
    setFormData({
      ...formData,
      sizes: [...formData.sizes, { id: newId, name: '', width: 0, height: 0, unit: 'inches', price_modifier: 0 }],
    });
  }

  function removeSize(index: number) {
    setFormData({
      ...formData,
      sizes: formData.sizes.filter((_, i) => i !== index),
    });
  }

  function updateSize(index: number, field: keyof PrintSize, value: any) {
    const sizes = [...formData.sizes];
    sizes[index] = { ...sizes[index], [field]: value };
    setFormData({ ...formData, sizes });
  }

  function calculateSizePrice(modifier: number) {
    const base = formData.base_price_usd;
    return (base * (1 + modifier / 100)).toFixed(2);
  }

  const typeColors: Record<string, string> = {
    print: 'bg-blue-500/10 text-blue-500',
    canvas: 'bg-purple-500/10 text-purple-500',
    frame: 'bg-orange-500/10 text-orange-500',
    other: 'bg-gray-500/10 text-gray-500',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Print Products</h1>
          <p className="text-muted-foreground mt-1">
            Manage print products, sizes, and pricing
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2.5">
              <Package className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Products</p>
              <p className="text-xl font-bold text-foreground">{products.length}</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2.5">
              <Check className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-xl font-bold text-foreground">
                {products.filter(p => p.is_active).length}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2.5">
              <Image className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Photo Prints</p>
              <p className="text-xl font-bold text-foreground">
                {products.filter(p => p.type === 'print').length}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500/10 p-2.5">
              <Frame className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Framed/Canvas</p>
              <p className="text-xl font-bold text-foreground">
                {products.filter(p => ['canvas', 'frame'].includes(p.type)).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Products Grid */}
      {products.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-foreground font-medium">No products created yet</p>
          <p className="text-muted-foreground mt-1">Add your first print product to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Product</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Type</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Base Price</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Sizes</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-right px-6 py-3 text-sm font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((product) => (
                <tr key={product.id} className="hover:bg-muted/30">
                  <td className="px-6 py-4">
                    <p className="font-medium text-foreground">{product.name}</p>
                    <p className="text-sm text-muted-foreground truncate max-w-xs">{product.description}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${typeColors[product.type]}`}>
                      {product.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-foreground">
                    {formatCurrency(product.base_price_usd)}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {product.sizes?.length || 0} sizes
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleActive(product.id, product.is_active)}
                      className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                        product.is_active
                          ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                          : 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20'
                      }`}
                    >
                      {product.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEditModal(product)}
                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-2 rounded-lg hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div 
          className="fixed bg-black/50 flex items-center justify-center z-50"
          style={{
            position: 'fixed',
            inset: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100dvw',
            height: '100dvh',
            margin: 0,
            padding: 0,
          }}
        >
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 my-4">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between sticky top-0 bg-card">
              <h2 className="text-xl font-bold text-foreground">
                {editingProduct ? 'Edit Product' : 'Add Product'}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Product Type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Product Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {productTypes.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setFormData({ ...formData, type: type.value as any })}
                      className={`p-3 rounded-lg border text-center transition-colors ${
                        formData.type === type.value
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      <type.icon className="h-5 w-5 mx-auto mb-1" />
                      <span className="text-xs">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Basic Info */}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Product Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Premium Matte Print"
                    className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Base Price (USD)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.base_price_usd}
                      onChange={(e) => setFormData({ ...formData, base_price_usd: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Product description..."
                  rows={2}
                  className="w-full px-4 py-2 rounded-lg bg-muted border border-input text-foreground"
                />
              </div>

              {/* Sizes */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium text-foreground">Available Sizes</label>
                  <button
                    onClick={addSize}
                    className="text-sm text-primary hover:underline"
                  >
                    + Add Size
                  </button>
                </div>

                {formData.sizes.length === 0 ? (
                  <div className="p-4 border border-dashed border-border rounded-lg text-center">
                    <Ruler className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No sizes added yet</p>
                    <button
                      onClick={addSize}
                      className="mt-2 text-sm text-primary hover:underline"
                    >
                      Add your first size
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-1">
                      <span className="col-span-3">Name</span>
                      <span className="col-span-2">Width</span>
                      <span className="col-span-2">Height</span>
                      <span className="col-span-2">Unit</span>
                      <span className="col-span-2">Price +%</span>
                      <span className="col-span-1"></span>
                    </div>
                    {formData.sizes.map((size, index) => (
                      <div key={size.id} className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="text"
                          value={size.name}
                          onChange={(e) => updateSize(index, 'name', e.target.value)}
                          placeholder="4x6"
                          className="col-span-3 px-3 py-2 rounded-lg bg-muted border border-input text-foreground text-sm"
                        />
                        <input
                          type="number"
                          value={size.width}
                          onChange={(e) => updateSize(index, 'width', parseFloat(e.target.value))}
                          className="col-span-2 px-3 py-2 rounded-lg bg-muted border border-input text-foreground text-sm"
                        />
                        <input
                          type="number"
                          value={size.height}
                          onChange={(e) => updateSize(index, 'height', parseFloat(e.target.value))}
                          className="col-span-2 px-3 py-2 rounded-lg bg-muted border border-input text-foreground text-sm"
                        />
                        <select
                          value={size.unit}
                          onChange={(e) => updateSize(index, 'unit', e.target.value)}
                          className="col-span-2 px-2 py-2 rounded-lg bg-muted border border-input text-foreground text-sm"
                        >
                          <option value="inches">in</option>
                          <option value="cm">cm</option>
                        </select>
                        <input
                          type="number"
                          value={size.price_modifier}
                          onChange={(e) => updateSize(index, 'price_modifier', parseFloat(e.target.value))}
                          className="col-span-2 px-3 py-2 rounded-lg bg-muted border border-input text-foreground text-sm"
                        />
                        <button
                          onClick={() => removeSize(index)}
                          className="col-span-1 p-2 rounded-lg text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {formData.sizes.length > 0 && formData.base_price_usd > 0 && (
                  <div className="mt-3 p-3 bg-muted rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Price Preview</p>
                    <div className="flex flex-wrap gap-2">
                      {formData.sizes.map(size => (
                        <span key={size.id} className="px-2 py-1 bg-card rounded text-xs text-foreground">
                          {size.name}: ${calculateSizePrice(size.price_modifier)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-foreground">Active (available for purchase)</span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-border flex justify-end gap-3 sticky bottom-0 bg-card">
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !formData.name}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingProduct ? 'Update Product' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

