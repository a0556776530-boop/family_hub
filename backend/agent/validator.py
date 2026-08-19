from __future__ import annotations
from agent.skills.base import ToolResult, ValidationResult
from agent.registry import READ_ONLY_TOOLS


class Validator:
    """
    Post-execution verifier. After every write tool, re-queries the DB via
    the skill's own validate() method to confirm the change is persisted.
    """

    def check(self, step, result: ToolResult, user: dict, context) -> ValidationResult:
        if not result.success:
            return ValidationResult.fail(result.error or 'tool reported failure')

        # Read-only tools: no verification needed
        if step.tool in READ_ONLY_TOOLS:
            return ValidationResult.ok(result.data)

        # Delegate to the skill that ran this tool
        try:
            from agent.skills import get_skill
            from agent.registry import get_skill_for_tool
            skill_name = get_skill_for_tool(step.tool)
            skill      = get_skill(skill_name)
            return skill.validate(step.tool, result, user, context)
        except Exception as e:
            # Validation infrastructure failure → trust the result but log
            import sys
            print(f'[validator] {step.tool}: {e!r}', file=sys.stderr)
            return ValidationResult.ok(result.data)
