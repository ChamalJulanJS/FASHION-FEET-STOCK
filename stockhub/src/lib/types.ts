export type Role = 'admin' | 'manager' | 'cashier' | 'staff' | string;

export interface Product {
  id: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  gender?: string | null;
}

export interface Variant {
  id: string;
  product_id: string;
  sku: string;
  barcode?: string | null;
  size?: string | null;
  colour?: string | null;
  selling_price: number;
  cost_price: number;
  products?: Product | null;
}

export interface Location {
  id: string;
  name: string;
  type?: string | null;
}

export interface Staff {
  id: string;
  name?: string | null;
  email: string;
  role?: Role | null;
  location_id?: string | null;
}

export interface CurrentUser {
  id?: string;
  name: string;
  email: string;
  role: Role;
  location_id: string | null;
}

export interface CartLine {
  variant: Variant;
  qty: number;
  availableStock: number;
}

export type ToastKind = 'info' | 'success' | 'error' | 'warning';
export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}
