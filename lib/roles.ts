export const APP_ROLES = ['superadmin', 'superadministrador', 'admin_pdv', 'contabilidad', 'tesoreria'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const isSuperRole = (rol?: string | null): rol is 'superadmin' | 'superadministrador' =>
  rol === 'superadmin' || rol === 'superadministrador';

export const isAccountingRole = (rol?: string | null): rol is 'contabilidad' => rol === 'contabilidad';

export const isTreasuryRole = (rol?: string | null): rol is 'tesoreria' => rol === 'tesoreria';

export const canManageSuperadminCatalogs = (rol?: string | null) => isSuperRole(rol);

export const canAccessBankAdmin = (rol?: string | null) => isTreasuryRole(rol);

export const getDefaultRouteForRole = (rol?: string | null) => {
  if (isTreasuryRole(rol)) {
    return '/admin-bancos';
  }

  if (isSuperRole(rol) || isAccountingRole(rol)) {
    return '/superadmin';
  }

  return '/admin';
};
