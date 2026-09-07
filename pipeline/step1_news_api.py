"""NewsAPI.org adapter. Never follows article URLs or scrapes publisher pages."""
from __future__ import annotations

import argparse
import hashlib
from datetime import date
from urllib.parse import urlsplit

import pandas as pd
import requests

from config.settings import Settings
from pipeline.io import atomic_write, json_text, utc_now, write_table
from pipeline.text_window import normalize_text

RAW_COLUMNS = ["article_id", "id_method", "focal_firm", "query_keyword", "query_string",
               "published_at", "source", "headline", "lead", "content", "url", "retrieved_at",
               "api_provider", "synthetic"]


def make_article_id(url: str, source="", published_at="", headline="") -> str:
    value = normalize_text(url) or "|".join(normalize_text(v) for v in (source, published_at, headline))
    return hashlib.sha256(value.encode()).hexdigest()[:24]


def query_inputs(firms, keywords, start_date, end_date, max_articles):
    firms = list(dict.fromkeys(normalize_text(f) for f in firms if normalize_text(f)))
    keywords = list(dict.fromkeys(normalize_text(k) for k in keywords if normalize_text(k)))
    if not firms or not keywords:
        raise ValueError("Enter at least one firm and one ESG keyword.")
    if len(firms) * len(keywords) > 30:
        raise ValueError("Use at most 30 firm–keyword queries for this workshop.")
    start, end = date.fromisoformat(str(start_date)), date.fromisoformat(str(end_date))
    if start > end or end > date.today():
        raise ValueError("Dates must be ordered and must not be in the future.")
    if not 1 <= max_articles <= 100:
        raise ValueError("Maximum articles per query must be between 1 and 100.")
    if any('"' in s for s in firms + keywords):
        raise ValueError("Enter firms and keywords without quotation marks; the app adds them.")
    if any(len(f'"{f}" AND "{k}"') > 500 for f in firms for k in keywords):
        raise ValueError("A search query exceeds the provider's 500-character limit.")
    return firms, keywords


def fetch_news(firms, keywords, start_date, end_date, api_key, base_url=None,
               page_size=25, max_articles_per_query=25, session=None, checkpoint=None):
    firms, keywords = query_inputs(firms, keywords, start_date, end_date, max_articles_per_query)
    if not api_key:
        raise ValueError("A News API key is required for live collection.")
    base_url = base_url or Settings.news_api_base_url
    parsed = urlsplit(base_url)
    if parsed.scheme != "https" or parsed.username or parsed.query or parsed.fragment:
        raise ValueError("Use an HTTPS News API endpoint without embedded credentials or query parameters.")
    if not 1 <= page_size <= 100:
        raise ValueError("Page size must be between 1 and 100.")
    client = session or requests.Session()
    rows, queries = [], []
    try:
        for firm in firms:
            for keyword in keywords:
                query = f'"{firm}" AND "{keyword}"'
                audit = {"focal_firm": firm, "keyword": keyword, "query": query,
                         "status": "ok", "retrieved": 0, "pages": 0, "capped": False}
                try:
                    for page in range(1, (max_articles_per_query + page_size - 1) // page_size + 1):
                        response = client.get(base_url, headers={"X-Api-Key": api_key}, params={
                            "q": query, "from": str(start_date), "to": str(end_date) + "T23:59:59",
                            "pageSize": page_size, "page": page, "language": "en", "sortBy": "publishedAt",
                        }, timeout=30, allow_redirects=False)
                        if response.status_code != 200:
                            audit.update(status="failed", error=f"HTTP {response.status_code}; check key, dates, or provider limits.")
                            break
                        payload = response.json()
                        if payload.get("status") != "ok" or not isinstance(payload.get("articles"), list):
                            audit.update(status="failed", error="Provider returned an invalid or unsuccessful response.")
                            break
                        audit["pages"] += 1
                        audit["total_available"] = payload.get("totalResults")
                        articles = payload["articles"]
                        for a in articles[:max_articles_per_query - audit["retrieved"]]:
                            source = (a.get("source") or {}).get("name")
                            url = a.get("url") or ""
                            rows.append({
                                "article_id": make_article_id(url, source, a.get("publishedAt"), a.get("title")),
                                "id_method": "url_sha256" if url else "source_date_headline_sha256",
                                "focal_firm": firm, "query_keyword": keyword, "query_string": query,
                                "published_at": a.get("publishedAt"), "source": source,
                                "headline": a.get("title"), "lead": a.get("description"),
                                "content": a.get("content"), "url": url, "retrieved_at": utc_now(),
                                "api_provider": "newsapi.org", "synthetic": False,
                            })
                            audit["retrieved"] += 1
                        if checkpoint:
                            checkpoint(pd.DataFrame(rows, columns=RAW_COLUMNS))
                        total = payload.get("totalResults")
                        if audit["retrieved"] >= max_articles_per_query:
                            audit["capped"] = isinstance(total, int) and total > audit["retrieved"]
                            break
                        if len(articles) < page_size or (isinstance(total, int) and page * page_size >= total):
                            break
                except (requests.RequestException, ValueError, TypeError, AttributeError):
                    # Never persist raw exceptions: they may contain headers, URLs, or secrets.
                    audit.update(status="failed", error="Retrieval failed; check connection and provider response.")
                queries.append(audit)
    finally:
        if session is None:
            client.close()
    out = pd.DataFrame(rows, columns=RAW_COLUMNS)
    out.attrs["collection_audit"] = queries
    out.attrs["collection_complete"] = all(q["status"] == "ok" for q in queries)
    return out


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--firms", nargs="+", required=True)
    p.add_argument("--keywords", nargs="+", required=True)
    p.add_argument("--start", required=True)
    p.add_argument("--end", required=True)
    p.add_argument("--max-articles", type=int, default=25)
    p.add_argument("--output", required=True)
    a = p.parse_args()
    s = Settings.from_env()
    df = fetch_news(a.firms, a.keywords, a.start, a.end, s.news_api_key, s.news_api_base_url,
                    max_articles_per_query=a.max_articles,
                    checkpoint=lambda df: write_table(df, a.output))
    write_table(df, a.output)
    atomic_write(a.output + ".audit.json", json_text(df.attrs))
    print(f"Saved {len(df)} raw query hits. Complete: {df.attrs['collection_complete']}")


if __name__ == "__main__":
    main()
