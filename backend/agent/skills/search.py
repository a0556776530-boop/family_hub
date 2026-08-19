from __future__ import annotations
import os
import re

from agent.skills.base import Skill, ToolResult, ValidationResult

_SPORTS_RE = re.compile(
    r'(?:משחק|תוצאה|ניצחון|הפסד|גול|ליגה|מחזור|אליפות|כדורגל|כדורסל|טניס|'
    r'שחקן|מאמן|קבוצה|ברצלונה|ריאל|מנצ\'סטר|ליברפול|פריז|מ\.ס\.|הפועל|מכבי|'
    r'NFL|NBA|UEFA|FIFA|Champions|Premier|LaLiga|Serie|Bundesliga)',
    re.IGNORECASE
)
_NEWS_RE = re.compile(
    r'(?:חדשות|מה קרה|מה קורה|עדכון|פוליטיקה|כלכלה|מזג\s+אוויר|תאונה|'
    r'פיגוע|בחירות|ממשלה|כנסת|ביטחון|צבא|צה"ל)',
    re.IGNORECASE
)

_IL_SPORTS  = ['sport5.co.il', 'one.co.il', 'mako.co.il', 'ynet.co.il', 'walla.co.il', 'sport1.co.il']
_INT_SPORTS = ['goal.com', 'bbc.com', 'espn.com', 'skysports.com', 'sofascore.com', 'flashscore.com']
_IL_NEWS    = ['ynet.co.il', 'walla.co.il', 'mako.co.il', 'haaretz.co.il', 'maariv.co.il', 'israelhayom.co.il']


class SearchSkill(Skill):
    name  = 'Search'
    tools = ['web_search']

    def execute(self, tool: str, params: dict, user: dict, context) -> ToolResult:
        if tool == 'web_search':
            return self._tavily_search(params, user)
        return ToolResult.fail(f'SearchSkill: unknown tool {tool!r}')

    def validate(self, tool: str, result: ToolResult, user: dict, context) -> ValidationResult:
        return ValidationResult.ok(result.data)

    def _tavily_search(self, params: dict, user: dict) -> ToolResult:
        try:
            from tavily import TavilyClient
            key = os.environ.get('TAVILY_API_KEY', '')
            if not key:
                return ToolResult.fail('TAVILY_API_KEY חסר')
            client = TavilyClient(api_key=key)
        except Exception as e:
            return ToolResult.fail(f'Tavily unavailable: {e}')

        query      = str(params.get('query', '')).strip()
        max_r      = min(int(params.get('max_results', 5)), 8)
        extra_doms = list(params.get('domains') or [])

        if not query:
            return ToolResult.fail('missing query')

        is_sports = bool(_SPORTS_RE.search(query))
        is_news   = bool(_NEWS_RE.search(query))

        kwargs: dict = {'max_results': max_r, 'include_answer': True, 'include_images': True}
        if is_sports:
            kwargs['topic']           = 'news'
            kwargs['include_domains'] = (_IL_SPORTS + _INT_SPORTS + extra_doms) or None
        elif is_news:
            kwargs['topic']           = 'news'
            kwargs['include_domains'] = (_IL_NEWS + extra_doms) or None
        elif extra_doms:
            kwargs['include_domains'] = extra_doms

        try:
            resp = client.search(query, **kwargs)
        except Exception as e:
            return ToolResult.fail(str(e))

        results_list = [
            {'title': r.get('title', ''), 'url': r.get('url', ''), 'content': r.get('content', '')[:400]}
            for r in resp.get('results', [])[:max_r]
        ]

        # Sports fallback: retry in English if no results
        if is_sports and not results_list:
            try:
                resp2 = client.search(
                    query + ' latest result score 2026',
                    max_results=max_r, include_answer=True,
                    topic='news', include_domains=_INT_SPORTS,
                )
                results_list = [
                    {'title': r.get('title', ''), 'url': r.get('url', ''), 'content': r.get('content', '')[:400]}
                    for r in resp2.get('results', [])[:max_r]
                ]
                resp = resp2 if results_list else resp
            except Exception:
                pass

        images = [img for img in (resp.get('images') or []) if isinstance(img, str)][:4]
        return ToolResult.ok({
            'query':   query,
            'answer':  resp.get('answer', ''),
            'results': results_list,
            'images':  images,
        })
