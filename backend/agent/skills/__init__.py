from agent.skills.shopping  import ShoppingSkill
from agent.skills.tasks     import TasksSkill
from agent.skills.calendar  import CalendarSkill
from agent.skills.search    import SearchSkill
from agent.skills.family    import FamilySkill
from agent.skills.reminders import ReminderSkill
from agent.skills.base      import Skill

SKILL_REGISTRY: dict[str, Skill] = {
    'Shopping':  ShoppingSkill(),
    'Tasks':     TasksSkill(),
    'Calendar':  CalendarSkill(),
    'Search':    SearchSkill(),
    'Family':    FamilySkill(),
    'Reminders': ReminderSkill(),
}


def get_skill(skill_name: str) -> Skill:
    skill = SKILL_REGISTRY.get(skill_name)
    if not skill:
        raise ValueError(f'Unknown skill: {skill_name!r}')
    return skill
