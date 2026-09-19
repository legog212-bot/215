export interface ServiceCategory {
  id: string;
  name_ka: string;
  name_ru: string;
  sort_order: number;
  is_active: boolean;
}

export interface Service {
  id: string;
  category_id: string;
  name_ka: string;
  name_ru: string;
  price_from: number;
  price_to: number | null;
  duration_minutes: number;
  is_active: boolean;
  sort_order: number;
}

export interface Master {
  id: string;
  name: string;
  is_active: boolean;
}

export interface WorkingHours {
  id: string;
  master_id: string | null;
  day_of_week: number; // 0=Sun ... 6=Sat
  open_time: string | null;
  close_time: string | null;
  is_day_off: boolean;
}

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';

export interface Booking {
  id: string;
  order_number: string;
  client_name: string;
  client_surname: string;
  client_phone: string;
  master_id: string | null;
  booking_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM[:SS]
  end_time: string;
  status: BookingStatus;
  cancel_token: string;
  comment: string | null;
  source: 'client' | 'admin';
  whatsapp_sent: boolean;
  created_at: string;
  booking_services?: { service_id: string; services: Service | null }[];
}

export interface BookingDetails {
  id: string;
  order_number: string;
  client_name: string;
  client_surname: string;
  client_phone: string;
  master_id: string | null;
  master_name: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  comment: string | null;
  created_at: string;
  services: Pick<
    Service,
    'id' | 'name_ka' | 'name_ru' | 'price_from' | 'price_to' | 'duration_minutes'
  >[];
}

export type Locale = 'ka' | 'ru' | 'en';

export function serviceName(s: Pick<Service, 'name_ka' | 'name_ru'>, locale: string) {
  return locale === 'ru' ? s.name_ru : s.name_ka;
}

export function formatPrice(s: Pick<Service, 'price_from' | 'price_to'>) {
  const from = Number(s.price_from);
  if (s.price_to == null) return `${from} ₾`;
  return `${from}-${Number(s.price_to)} ₾`;
}
