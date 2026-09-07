from __future__ import annotations
import copy
import json
import re
from urllib.parse import urlparse
from jsonschema import Draft202012Validator

SOURCES = [
    ('Reuters', 'reuters.com'), ('Bloomberg', 'bloomberg.com'), ('Financial Times', 'ft.com'),
    ('The Wall Street Journal', 'wsj.com'), ('CNBC', 'cnbc.com'), ('The Economist', 'economist.com'),
    ('Fortune', 'fortune.com'), ('Business Insider', 'businessinsider.com'), ('MarketWatch', 'marketwatch.com'),
]


def news_query(company, query):
    company, query = company.strip(), query.strip()
    if not company or not query:
        raise ValueError('Company name and Query are both required.')
    if any(x in company for x in ('"', '\n', '\r')):
        raise ValueError('Company name cannot contain double quotes or line breaks. Put search expressions in Query.')
    combined = f'"{company}" AND ({query})'
    if len(combined) > 500:
        raise ValueError(f'Combined query is {len(combined)} characters; NewsAPI permits at most 500.')
    return combined


def domains(values):
    result = []
    for value in values:
        host = urlparse(value if '://' in value else 'https://' + value).hostname
        if not host or not re.fullmatch(r'[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', host):
            raise ValueError(f'Invalid publisher domain: {value}')
        host = host.lower().removeprefix('www.')
        if host not in result:
            result.append(host)
    return result


def validate_schema(schema, enums=None):
    """Validate the supported strict-output subset without rewriting the user's schema."""
    enums = enums or {}
    if not isinstance(enums, dict) or any(not isinstance(v, list) or not v or any(not isinstance(x, str) for x in v) for v in enums.values()):
        raise ValueError('Enums must be an object of named, nonempty string lists.')
    if not isinstance(schema, dict) or schema.get('type') != 'object':
        raise ValueError('Schema root must have type object.')
    try:
        Draft202012Validator.check_schema(schema)
    except Exception as exc:
        raise ValueError(f'Invalid JSON Schema: {getattr(exc, "message", "check the field definitions")}') from None
    allowed = {'type', 'properties', 'required', 'additionalProperties', 'items', 'enum', 'description', 'title', '$defs', '$ref', 'anyOf'}
    count = [0]

    def check(node, path='$', depth=0):
        if not isinstance(node, dict):
            raise ValueError(f'{path}: use an explicit schema object.')
        unknown = set(node) - allowed
        if unknown:
            raise ValueError(f'{path}: unsupported feature(s) {", ".join(sorted(unknown))}. Use types, enums, nullable values, objects, and arrays.')
        if depth > 10:
            raise ValueError('Schema nesting exceeds 10 levels.')
        if '$ref' in node:
            ref = node['$ref']
            if not ref.startswith('#/$defs/') or ref[8:] not in schema.get('$defs', {}):
                raise ValueError(f'{path}: only references to root $defs are supported.')
        if 'anyOf' in node:
            for idx, sub in enumerate(node['anyOf']):
                check(sub, f'{path}.anyOf[{idx}]', depth + 1)
        typ = node.get('type')
        types = typ if isinstance(typ, list) else [typ] if typ else []
        if any(t not in {'string', 'number', 'integer', 'boolean', 'null', 'object', 'array'} for t in types):
            raise ValueError(f'{path}: unsupported field type.')
        if not types and '$ref' not in node and 'anyOf' not in node:
            raise ValueError(f'{path}: specify a field type.')
        if 'object' in types:
            props = node.get('properties', {})
            count[0] += len(props)
            if node.get('additionalProperties') is not False or set(node.get('required', [])) != set(props):
                raise ValueError(f'{path}: set additionalProperties to false and list every property in required. Use a nullable type for optional values.')
            for name, sub in props.items():
                check(sub, path + '.' + name, depth + 1)
        if 'array' in types:
            if 'items' not in node:
                raise ValueError(f'{path}: arrays need an items schema.')
            check(node['items'], path + '[]', depth + 1)
        for name, sub in node.get('$defs', {}).items():
            check(sub, '#/$defs/' + name, depth + 1)
    check(schema)
    if count[0] > 5000:
        raise ValueError('Schema contains more than 5,000 properties.')
    return schema


def templates():
    from schemas.esg_event import ESGEvent
    from config.taxonomies import taxonomy_lists
    from pipeline.step4_openai_extract import SYSTEM_PROMPT
    return {
        'esg': {'preset': 'esg', 'instructions': SYSTEM_PROMPT, 'enums': taxonomy_lists(), 'schema': ESGEvent.model_json_schema()},
        'blank': {'preset': 'custom', 'instructions': 'Extract the requested information using only the supplied record. Use null when a nullable field cannot be determined.', 'enums': {},
                  'schema': {'type': 'object', 'properties': {'summary': {'type': ['string', 'null']}}, 'required': ['summary'], 'additionalProperties': False}},
    }


def text_input(row, columns, word_limit):
    from pipeline.text_window import normalize_text
    joined = '\n\n'.join(normalize_text(row.get(col)) for col in columns if normalize_text(row.get(col)))
    words = joined.split()
    return {'text': ' '.join(words[:word_limit]), 'words_available': len(words), 'words_used': min(word_limit, len(words)), 'word_truncated': len(words) > word_limit}


def selected_rows(df, config):
    indexes = list(range(len(df)))
    filt = config.get('filter') or {}
    if filt.get('column'):
        if filt['column'] not in df.columns:
            raise ValueError('Filter column is missing. Choose a column from this input file.')
        values = {str(x) for x in filt.get('values', [])}
        indexes = [i for i in indexes if (str(df.iloc[i][filt['column']]) in values) != (filt.get('mode') == 'exclude')]
    limit = config.get('row_limit', 0)
    return indexes[:limit] if limit else indexes


def validate_config(tool, config, df=None):
    c = copy.deepcopy(config)
    if tool == 'news':
        c['combined_query'] = news_query(c.get('company', ''), c.get('query', ''))
        c['domains'] = domains(c.get('domains', []))
        if not 1 <= int(c.get('max_results', 100)) <= 10000:
            raise ValueError('Maximum results must be between 1 and 10,000.')
        if c.get('from') and c.get('to') and c['from'] > c['to']:
            raise ValueError('Start date must precede end date.')
        if c.get('sort', 'publishedAt') not in {'publishedAt', 'popularity', 'relevancy'}:
            raise ValueError('Choose a valid NewsAPI sort order.')
        if set(c.get('search_in', [])) - {'title', 'description', 'content'}:
            raise ValueError('Search fields must be title, description or content.')
    elif tool in ('hf', 'llm'):
        cols = c.get('columns', [])
        if not cols or any(col not in df.columns for col in cols):
            raise ValueError('Select at least one existing text column, in the order to process.')
        if not 1 <= int(c.get('word_limit', 150)) <= 100000:
            raise ValueError('Text budget must be between 1 and 100,000 words.')
        if not c.get('model', '').strip():
            raise ValueError('Choose or enter a model ID.')
        prefix = c.get('prefix', '')
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,40}', prefix):
            raise ValueError('Output prefix must start with a letter and contain only letters, digits and underscores.')
        if any(str(col).startswith(prefix) for col in df.columns):
            raise ValueError('The output prefix overlaps source columns. Choose a different prefix to preserve them.')
        if tool == 'hf':
            if not 1 <= int(c.get('batch_size', 8)) <= 128:
                raise ValueError('Batch size must be between 1 and 128.')
        else:
            validate_schema(c.get('schema'), c.get('enums'))
            if c.get('preset') == 'esg' and c['schema'] != templates()['esg']['schema']:
                raise ValueError('ESG semantic checks require the ESG starter schema. Switch to Custom before changing its fields.')
            if not c.get('instructions', '').strip():
                raise ValueError('Provide custom instructions.')
            if c.get('row_limit', 0) < 0:
                raise ValueError('Row limit must be zero (all) or positive.')
            selected_rows(df, c)
            if any(col not in df.columns for col in c.get('context_columns', [])):
                raise ValueError('A context column is missing. Select context columns from this input file.')
            if c.get('temperature') is not None and not 0 <= float(c['temperature']) <= 2:
                raise ValueError('Temperature must be between 0 and 2. Leave it off for models that do not support it.')
            if c.get('reasoning_effort') and c['reasoning_effort'] not in {'none', 'minimal', 'low', 'medium', 'high', 'xhigh'}:
                raise ValueError('Unsupported reasoning effort.')
    elif tool == 'clean':
        for col in c.get('columns', []) + c.get('duplicate_keys', []):
            if col not in df.columns:
                raise ValueError(f'Map the missing column: {col}')
    elif tool == 'aggregate':
        for name in ['firm', 'date', 'relevance', 'dimension', 'relationship', 'theme']:
            if c.get('mapping', {}).get(name) not in df.columns:
                raise ValueError(f'Map the {name} column from your selected dataset.')
    else:
        raise ValueError('Unknown processing tool.')
    return c
