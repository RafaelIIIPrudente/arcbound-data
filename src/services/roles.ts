// Mock role definitions behind the Service Seam. These are illustrative; real
// access is enforced by the RBAC guard (see src/lib/authz.ts).

export interface RoleCard {
  id: string;
  abbreviation: string;
  name: string;
  description: string;
  peopleCount: number;
}

export async function listRoles(): Promise<RoleCard[]> {
  return [
    {
      id: "superadmin",
      abbreviation: "SA",
      name: "Superadmin",
      description: "Full, unrestricted access including system management screens.",
      peopleCount: 2,
    },
    {
      id: "admin",
      abbreviation: "AD",
      name: "Admin",
      description: "Manages organization configuration, members, and roles.",
      peopleCount: 8,
    },
    {
      id: "manager",
      abbreviation: "MG",
      name: "Manager",
      description: "Manages the people and content that report to them.",
      peopleCount: 24,
    },
    {
      id: "member",
      abbreviation: "MB",
      name: "Member",
      description: "Default role for anyone who signs up through onboarding.",
      peopleCount: 312,
    },
  ];
}
