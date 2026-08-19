from __future__ import annotations
from agent.registry import Permission, REGISTRY


PARENT_ROLES = {'parent', 'admin'}

AUTO_TOOLS = {
    'add_shopping_items', 'get_shopping_list', 'toggle_shopping_done',
    'get_upcoming_events', 'create_event', 'update_event',
    'get_tasks', 'create_task', 'update_task',
    'web_search', 'get_family_info', 'send_push_notification',
}

CONFIRM_TOOLS = {
    'delete_task', 'delete_event', 'delete_shopping_item',
    'clear_completed_shopping',
}

ROLE_AWARE_TOOLS = {'complete_task'}


class PermissionGate:

    def filter(self, plan, user: dict):
        """
        Annotate each step with permission info.
        Steps requiring confirmation are flagged; the caller decides whether to
        emit an ask_user event or auto-proceed.
        """
        role = str(user.get('role', 'member'))
        for step in plan.steps:
            td = REGISTRY.get(step.tool)
            if td is None:
                step.requires_confirmation = True
                continue

            if td.permission == Permission.CONFIRM or step.tool in CONFIRM_TOOLS:
                step.requires_confirmation = True

            if td.permission == Permission.ROLE_AWARE or step.tool in ROLE_AWARE_TOOLS:
                step.role_override = {'status': 'done' if role in PARENT_ROLES else 'awaiting_approval'}

            if td.permission == Permission.ADMIN_ONLY and role not in PARENT_ROLES:
                step.blocked       = True
                step.block_reason  = 'נדרשות הרשאות מנהל לפעולה זו'

        return plan

    def check_step(self, step, user: dict) -> tuple[bool, str]:
        """Returns (allowed, reason). Used before each execution."""
        if getattr(step, 'blocked', False):
            return False, getattr(step, 'block_reason', 'פעולה חסומה')
        return True, ''
