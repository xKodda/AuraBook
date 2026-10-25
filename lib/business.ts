import "server-only";
import { cache } from "react";
import { DEMO_MODE, demoBusinessBySlug } from "./demo";
import { publicDb } from "./supabase";
import type { Business, BusinessCategory, Service, StaffMember } from "./types";

type DbBusiness = {
  id: string;
  slug: string;
  name: string;
  category: BusinessCategory;
  tagline: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  timezone: string;
  brand_color: string;
  logo_url: string | null;
  max_days_ahead: number;
  cancel_notice_min: number;
};

type DbService = {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  price_clp: number;
};

type DbStaff = { id: string; name: string; role_title: string | null; avatar_url: string | null };
type DbEligibility = { staff_id: string; service_id: string };

/** Catálogo público de un negocio. `cache` evita consultas duplicadas en metadata + página. */
export const getBusiness = cache(async (slug: string): Promise<Business | null> => {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  if (DEMO_MODE) return demoBusinessBySlug(slug);
  const db = publicDb();
  const { data: row, error } = await db
    .from("businesses")
    .select("id,slug,name,category,tagline,description,address,phone,timezone,brand_color,logo_url,max_days_ahead,cancel_notice_min")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Error al consultar negocio: ${error.message}`);
  if (!row) return null;
  const business = row as DbBusiness;
  const [servicesResponse, staffResponse, eligibilityResponse] = await Promise.all([
    db.from("services").select("id,name,description,duration_min,price_clp")
      .eq("business_id", business.id).eq("is_active", true).order("sort_order").order("name"),
    db.from("staff").select("id,name,role_title,avatar_url")
      .eq("business_id", business.id).eq("is_active", true).order("sort_order"),
    db.from("staff_services").select("staff_id,service_id").eq("business_id", business.id),
  ]);
  if (servicesResponse.error || staffResponse.error || eligibilityResponse.error) {
    throw new Error("No se pudo obtener el catálogo público del negocio.");
  }
  const services: Service[] = ((servicesResponse.data ?? []) as DbService[]).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? "",
    durationMin: s.duration_min,
    priceClp: s.price_clp,
  }));
  const eligible = (eligibilityResponse.data ?? []) as DbEligibility[];
  const staff: StaffMember[] = ((staffResponse.data ?? []) as DbStaff[]).map((m) => ({
    id: m.id,
    name: m.name,
    roleTitle: m.role_title,
    avatarUrl: m.avatar_url,
    serviceIds: eligible.filter((x) => x.staff_id === m.id).map((x) => x.service_id),
  }));
  return {
    id: business.id,
    slug: business.slug,
    name: business.name,
    category: business.category,
    tagline: business.tagline ?? "",
    description: business.description ?? "",
    address: business.address ?? "",
    phone: business.phone ?? "",
    timezone: business.timezone,
    brandColor: business.brand_color,
    logoUrl: business.logo_url,
    maxDaysAhead: business.max_days_ahead,
    cancelNoticeMin: business.cancel_notice_min,
    services,
    staff,
  };
});
