from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ToolResult:
    success: bool
    data: dict = field(default_factory=dict)
    error: str = ''
    model_used: str = ''

    @classmethod
    def ok(cls, data: dict, model_used: str = '') -> 'ToolResult':
        return cls(success=True, data=data, model_used=model_used)

    @classmethod
    def fail(cls, error: str) -> 'ToolResult':
        return cls(success=False, data={}, error=error)


@dataclass
class ValidationResult:
    verified: bool
    actual_data: dict = field(default_factory=dict)
    issues: list[str] = field(default_factory=list)
    error: str = ''

    @classmethod
    def ok(cls, actual_data: dict | None = None) -> 'ValidationResult':
        return cls(verified=True, actual_data=actual_data or {})

    @classmethod
    def fail(cls, error: str) -> 'ValidationResult':
        return cls(verified=False, error=error)


class Skill(ABC):
    name: str
    tools: list[str]

    @abstractmethod
    def execute(self, tool: str, params: dict, user: dict, context) -> ToolResult:
        ...

    @abstractmethod
    def validate(self, tool: str, result: ToolResult, user: dict, context) -> ValidationResult:
        ...
