// Mock team data behind the Service Seam. Swap for real queries later.

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarInitials: string;
}

export interface PermissionRow {
  name: string;
  readOnly?: boolean;
  member: boolean;
  manager: boolean;
  admin: boolean;
}

export interface PermissionGroup {
  name: string;
  permissions: PermissionRow[];
}

export async function listMembers(): Promise<Member[]> {
  return [
    {
      id: "1",
      name: "Sienna Hewitt",
      email: "sienna@example.com",
      role: "Admin",
      avatarInitials: "SH",
    },
    {
      id: "2",
      name: "Ammar Foley",
      email: "ammar@example.com",
      role: "Manager",
      avatarInitials: "AF",
    },
    {
      id: "3",
      name: "Olly Schroeder",
      email: "olly@example.com",
      role: "Member",
      avatarInitials: "OS",
    },
    {
      id: "4",
      name: "Mathilde Lewis",
      email: "mathilde@example.com",
      role: "Member",
      avatarInitials: "ML",
    },
  ];
}

export async function listPermissionGroups(): Promise<PermissionGroup[]> {
  return [
    {
      name: "Content",
      permissions: [
        { name: "View content", readOnly: true, member: true, manager: true, admin: true },
        { name: "Create content", member: true, manager: true, admin: true },
        { name: "Publish content", member: false, manager: true, admin: true },
        { name: "Delete content", member: false, manager: false, admin: true },
      ],
    },
    {
      name: "Team management",
      permissions: [
        { name: "Invite members", member: false, manager: true, admin: true },
        { name: "Assign roles", member: false, manager: false, admin: true },
        { name: "Remove members", member: false, manager: false, admin: true },
      ],
    },
  ];
}
