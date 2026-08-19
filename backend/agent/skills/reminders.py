from __future__ import annotations
from agent.skills.base import Skill, ToolResult, ValidationResult


class ReminderSkill(Skill):
    name  = 'Reminders'
    tools = ['send_push_notification']

    def execute(self, tool: str, params: dict, user: dict, context) -> ToolResult:
        if tool == 'send_push_notification':
            return self._send_push(params, user)
        return ToolResult.fail(f'ReminderSkill: unknown tool {tool!r}')

    def validate(self, tool: str, result: ToolResult, user: dict, context) -> ValidationResult:
        return ValidationResult.ok(result.data)

    def _send_push(self, params: dict, user: dict) -> ToolResult:
        title = str(params.get('title', '')).strip()
        body  = str(params.get('body', '')).strip()
        url   = str(params.get('url', '/')).strip()
        if not title:
            return ToolResult.fail('missing notification title')
        try:
            from routes.notifications import send_push_to_family
            sent = send_push_to_family(
                family_id=user['family_id'],
                title=title,
                body=body,
                url=url,
            )
            return ToolResult.ok({'sent': sent or 0, 'title': title})
        except Exception as e:
            return ToolResult.fail(f'push notification failed: {e}')
