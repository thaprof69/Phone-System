import {
  Banner,
  DataTable,
  EmptyState,
  Panel,
  StatusPill,
  formatNumber,
  humaniseState,
  type Column,
} from '@quantum-parks/ui';
import { AdministrationShell } from '../admin-shell';
import { apiGet } from '../../../lib/api';
import { UserRoleManager } from '../administration-actions';

export const dynamic = 'force-dynamic';

type AccessUser = {
  id: string;
  displayName: string;
  email: string;
  oidcSubject: string;
  active: boolean;
  sensitiveClearance: boolean;
  roles: string[];
  separationOfDutyWarnings: string[];
};

type AccessRole = {
  id: string;
  key: string;
  name: string;
  description: string;
  memberCount: number;
  permissions: string[];
};

export default async function UsersPage() {
  const response = await apiGet<{ users: AccessUser[]; roles: AccessRole[] }>(
    '/administration/access',
    { purpose: 'RELEASE_MANAGEMENT' },
  );

  if (!response.ok) {
    return (
      <AdministrationShell
        current="/administration/users"
        title="Users and roles"
        description="Who has access, with what authority."
      >
        <Panel title="Access administration unavailable">
          <EmptyState title="Could not be read" detail={response.reason} />
        </Panel>
      </AdministrationShell>
    );
  }

  const { users, roles } = response.data;
  const conflicts = users.filter((user) => user.separationOfDutyWarnings.length > 0);
  const roleIdByKey = new Map(roles.map((role) => [role.key, role.id]));
  const roleOptions = roles.map((role) => ({ id: role.id, name: role.name }));

  const userColumns: Column<AccessUser>[] = [
    {
      key: 'name',
      header: 'Person',
      render: (user) => (
        <>
          {user.displayName}
          <small className="cell-sub">{user.email}</small>
        </>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) =>
        user.roles.length === 0 ? (
          <span className="muted-cell">No roles</span>
        ) : (
          <span className="role-chips">
            {user.roles.map((role) => (
              <span className="role-chip" key={role}>
                {humaniseState(role)}
              </span>
            ))}
          </span>
        ),
    },
    {
      key: 'clearance',
      header: 'Sensitive access',
      render: (user) =>
        user.sensitiveClearance ? (
          <StatusPill tone="warning">Cleared</StatusPill>
        ) : (
          <span className="muted-cell">No</span>
        ),
    },
    {
      key: 'separation',
      header: 'Separation of duties',
      render: (user) =>
        user.separationOfDutyWarnings.length === 0 ? (
          <StatusPill tone="good">No conflict</StatusPill>
        ) : (
          <StatusPill tone="danger" title={user.separationOfDutyWarnings.join('; ')}>
            {formatNumber(user.separationOfDutyWarnings.length)} conflicts
          </StatusPill>
        ),
    },
    {
      key: 'active',
      header: 'Account',
      render: (user) =>
        user.active ? (
          <StatusPill tone="good">Active</StatusPill>
        ) : (
          <StatusPill tone="neutral">Disabled</StatusPill>
        ),
      priority: 'secondary',
    },
    {
      key: 'manage',
      header: 'Roles',
      render: (user) => (
        <details className="row-actions">
          <summary>Manage roles</summary>
          <div className="row-actions-body">
            <UserRoleManager
              userId={user.id}
              roleOptions={roleOptions}
              heldRoleIds={user.roles
                .map((key) => roleIdByKey.get(key))
                .filter((id): id is string => Boolean(id))}
            />
          </div>
        </details>
      ),
    },
  ];

  const roleColumns: Column<AccessRole>[] = [
    {
      key: 'name',
      header: 'Role',
      render: (role) => (
        <>
          {role.name}
          <small className="cell-sub">{role.description}</small>
        </>
      ),
    },
    {
      key: 'members',
      header: 'People',
      align: 'end',
      render: (role) => formatNumber(role.memberCount),
    },
    {
      key: 'permissions',
      header: 'Grants',
      render: (role) =>
        role.permissions.length === 0 ? (
          <span className="muted-cell">None recorded</span>
        ) : (
          `${formatNumber(role.permissions.length)} permissions`
        ),
    },
  ];

  return (
    <AdministrationShell
      current="/administration/users"
      title="Users and roles"
      description="Who has access to the control plane, what authority each role carries, and where one person holds a combination that defeats a control."
      meta={
        <StatusPill tone={conflicts.length > 0 ? 'danger' : 'good'}>
          {formatNumber(conflicts.length)} separation-of-duty conflicts
        </StatusPill>
      }
    >
      {conflicts.length > 0 ? (
        <Banner
          tone="warning"
          title={`${formatNumber(conflicts.length)} people hold conflicting roles`}
        >
          Holding both the authoring and the approving role for the same artefact defeats the
          independent-approver check. The server still blocks self-approval on individual records,
          but the combination should not be granted.
        </Banner>
      ) : null}

      <Panel
        title="People"
        eyebrow={`${formatNumber(users.length)} accounts`}
        description="Authorisation is evaluated from the permission matrix in code; this registry records who holds which role."
      >
        <DataTable
          caption="People with their roles, sensitive-access clearance and separation-of-duty state"
          columns={userColumns}
          rows={users}
          getRowKey={(user) => user.id}
          empty={
            <EmptyState
              title="No accounts"
              detail="Accounts appear here once identities are provisioned."
            />
          }
        />
      </Panel>

      <Panel
        title="Roles"
        eyebrow={`${formatNumber(roles.length)} roles`}
        description="Each role grants a fixed set of permissions. A route also declares the purpose a request must carry."
      >
        <DataTable
          caption="Roles with their member count and number of permission grants"
          columns={roleColumns}
          rows={roles}
          getRowKey={(role) => role.id}
          empty={
            <EmptyState title="No roles defined" detail="Roles are seeded with the platform." />
          }
        />
      </Panel>
    </AdministrationShell>
  );
}
