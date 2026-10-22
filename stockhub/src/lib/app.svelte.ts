import { restGet } from './api';
import { setSoundEnabled } from './sound';
import type { CartLine, CurrentUser, Location, Staff, Toast, ToastKind, Variant } from './types';

const USER_KEYS = ['ff_transfer_user', 'ff_pos_user'];

export type HubTab = 'pos' | 'grn' | 'transfer' | 'reorder' | 'stockcount' | 'history';
export type ConnStatus = 'loading' | 'connected' | 'error';

class AppStore {
  // --- session / config ---
  currentUser = $state<CurrentUser | null>(null);
  allStaff = $state<Staff[]>([]);
  locations = $state<Location[]>([]);

  // --- catalog / stock ---
  catalog = $state<Variant[]>([]);
  /** product_id -> variants */
  productsMap = $state<Map<string, Variant[]>>(new Map());
  /** `${variant_id}_${location_id}` -> qty */
  stockMap = $state<Map<string, number>>(new Map());
  isSyncing = $state(false);
  /** bumps after each successful sync so views can react */
  syncVersion = $state(0);

  // --- route (transfer) ---
  fromId = $state('');
  toId = $state('');

  // --- shared cart (Transfer batch). reorder -> transfer hands off through here ---
  cart = $state<CartLine[]>([]);

  // --- ui ---
  tab = $state<HubTab>(
    (['pos', 'grn', 'transfer', 'reorder', 'stockcount', 'history'].includes(localStorage.getItem('ff_hub_active_tab') || '')
      ? (localStorage.getItem('ff_hub_active_tab') as HubTab)
      : 'transfer'),
  );
  theme = $state<'dark' | 'light'>((localStorage.getItem('ff_theme') as any) === 'light' ? 'light' : 'dark');
  soundEnabled = $state(true);
  autoScan = $state(true);
  connStatus = $state<ConnStatus>('loading');
  connText = $state('Connecting...');
  toasts = $state<Toast[]>([]);
  authOpen = $state(false);
  authMandatory = $state(true);
  staffManagerOpen = $state(false);
  authTab = $state<'login' | 'signup' | 'reset'>('login');
  authPrefillEmail = $state('');
  deferredPwaPrompt = $state<any>(null);
  branchStockModalOpen = $state(false);
  arMeasureOpen = $state(false);

  private toastSeq = 0;

  // ---------------- helpers ----------------
  isWarehouse(loc?: Location | null) {
    if (!loc) return false;
    return loc.name.toLowerCase().includes('head office') || !!(loc.type && loc.type.toLowerCase().includes('warehouse'));
  }
  locationName(id?: string | null) {
    return this.locations.find((l) => l.id === id)?.name ?? '';
  }
  getStock(variantId?: string | null, locationId?: string | null) {
    if (!variantId || !locationId) return 0;
    return this.stockMap.get(`${variantId}_${locationId}`) || 0;
  }
  totalStockAt(locationId: string) {
    let t = 0;
    for (const v of this.catalog) t += this.getStock(v.id, locationId);
    return t;
  }

  toast(message: string, kind: ToastKind = 'info') {
    const id = ++this.toastSeq;
    this.toasts.push({ id, message, kind });
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
    }, 3800);
  }

  setConn(status: ConnStatus, text: string) {
    this.connStatus = status;
    this.connText = text;
  }

  setTheme(t: 'dark' | 'light') {
    this.theme = t;
    localStorage.setItem('ff_theme', t);
    document.documentElement.classList.toggle('light', t === 'light');
  }
  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }
  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    setSoundEnabled(this.soundEnabled);
  }

  // ---------------- session ----------------
  restoreSession() {
    try {
      for (const store of [localStorage, sessionStorage]) {
        for (const k of USER_KEYS) {
          const raw = store.getItem(k);
          if (!raw) continue;
          const p = JSON.parse(raw);
          if (p?.email && !p.email.includes('_autodefault')) {
            this.currentUser = {
              id: p.id,
              name: p.name || p.full_name || p.email.split('@')[0],
              email: p.email,
              role: p.role || 'staff',
              location_id: p.location_id ?? null,
            };
            this.authOpen = false;
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Session restore error', e);
    }
    this.currentUser = null;
    for (const k of USER_KEYS) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
    this.openLogin(true);
  }
  openLogin(mandatory = false) {
    this.authMandatory = mandatory;
    this.authTab = 'login';
    this.authOpen = true;
  }
  persistUser(u: CurrentUser, remember: boolean) {
    const raw = JSON.stringify(u);
    if (remember) {
      localStorage.setItem('ff_transfer_user', raw);
      sessionStorage.removeItem('ff_transfer_user');
    } else {
      sessionStorage.setItem('ff_transfer_user', raw);
      localStorage.removeItem('ff_transfer_user');
    }
  }
  logout() {
    for (const k of USER_KEYS) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
    this.currentUser = null;
    this.openLogin(true);
  }

  // ---------------- data ----------------
  async fetchLocations() {
    try {
      this.locations = (await restGet<Location[]>('locations?select=*&order=name.asc')) || [];
      const L = this.locations;
      const gallery = L.find((l) => l.name.toLowerCase().includes('shoe gallery'));
      const head = L.find((l) => l.name.toLowerCase().includes('head office'));
      const ff = L.find((l) => l.name.toLowerCase().includes('ff branch'));
      this.fromId = gallery?.id ?? L[0]?.id ?? '';
      if (head && head.id !== this.fromId) this.toId = head.id;
      else if (ff && ff.id !== this.fromId) this.toId = ff.id;
      else this.toId = L[1]?.id ?? '';
    } catch (e) {
      console.error(e);
      this.toast('Error loading store locations from database.', 'error');
    }
  }
  async fetchStaff() {
    try {
      this.allStaff = (await restGet<Staff[]>('profiles?select=*&order=name.asc')) || [];
    } catch (e) {
      console.warn('Staff fetch error', e);
    }
  }
  async syncCatalogAndStock(silent = false) {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.setConn('loading', 'Syncing Catalog & Stock...');
    try {
      const cat = await restGet<Variant[]>(
        'product_variants?select=id,product_id,sku,barcode,size,colour,selling_price,cost_price,products(id,name,brand,category,gender)&limit=3000',
      );
      const map = new Map<string, Variant[]>();
      for (const v of cat) {
        const pid = v.product_id || v.products?.id || 'unknown';
        if (!map.has(pid)) map.set(pid, []);
        map.get(pid)!.push(v);
      }
      const stocks = await restGet<{ variant_id: string; location_id: string; quantity: number }[]>(
        'stock_levels?select=variant_id,location_id,quantity&limit=5000',
      );
      const sm = new Map<string, number>();
      for (const s of stocks) sm.set(`${s.variant_id}_${s.location_id}`, Number(s.quantity) || 0);
      this.catalog = cat;
      this.productsMap = map;
      this.stockMap = sm;
      this.syncVersion++;
      this.setConn('connected', `Connected • ${cat.length} Styles Synced`);
      if (!silent) this.toast(`Catalog synced — ${cat.length} shoe variants loaded.`, 'success');
    } catch (e) {
      console.error(e);
      this.setConn('error', 'Sync Error • Check Connection');
      this.toast('Failed to sync live catalog from Supabase.', 'error');
    } finally {
      this.isSyncing = false;
    }
  }

  async init() {
    this.setTheme(this.theme);
    this.setConn('loading', 'Connecting to Supabase...');
    await this.fetchLocations();
    await this.fetchStaff();
    this.restoreSession();
    if (this.currentUser?.location_id) this.fromId = this.currentUser.location_id;
    if (location.hash.includes('reorder')) this.tab = 'reorder';
    await this.syncCatalogAndStock();
  }
}

export const app = new AppStore();

// ---------------- shoe size helpers (Sri Lanka: Men's EU 40 = UK 6) ----------------
export function isMenShoe(product?: { gender?: string | null; name?: string | null; category?: string | null } | null) {
  if (!product) return false;
  const g = (product.gender || '').trim().toUpperCase();
  const n = (product.name || '').toUpperCase();
  const c = (product.category || '').toUpperCase();
  for (const w of ['WOMEN', 'LADIES', 'GIRL', 'KIDS', 'BABY']) {
    if (g.includes(w) || n.includes(w) || c.includes(w)) return false;
  }
  return true;
}

export function getShoeDisplaySize(
  rawSize: string | number | null | undefined,
  product?: Parameters<typeof isMenShoe>[0],
  format: 'full' | 'uk_only' = 'full',
) {
  if (!rawSize) return '-';
  const s = rawSize.toString().trim();
  const num = parseFloat(s);
  if (!isNaN(num) && num >= 35 && num <= 48 && isMenShoe(product)) {
    const uk = num - 34;
    return format === 'uk_only' ? `${uk}` : `${uk} (${num})`;
  }
  return s;
}

export const fmtMoney = (n: number) =>
  'Rs. ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
