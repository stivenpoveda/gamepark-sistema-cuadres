export const APP_ROLES = ['superadmin', 'superadministrador', 'admin_pdv', 'contabilidad'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const isSuperRole = (rol?: string | null): rol is 'superadmin' | 'superadministrador' =>
  rol === 'superadmin' || rol === 'superadministrador';

export const isAccountingRole = (rol?: string | null): rol is 'contabilidad' => rol === 'contabilidad';

export const canManageSuperadminCatalogs = (rol?: string | null) => isSuperRole(rol);

export const getDefaultRouteForRole = (rol?: string | null) => {
  if (isSuperRole(rol) || isAccountingRole(rol)) {
    return '/superadmin';
  }

  return '/admin';
};
