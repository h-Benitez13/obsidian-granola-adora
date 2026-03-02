# Adora Dashboard

## Recent Meetings

```dataview
TABLE date as Date, customers as Customers, owner as Owner
FROM "Adora/Meetings"
SORT date DESC
LIMIT 20
```

## Top Open Customer Risks

```dataview
TABLE health_score as Score, health_tier as Tier
FROM "Adora/Customers"
WHERE health_tier = "at-risk" OR health_tier = "critical"
SORT health_score ASC
```

## Latest Product Asks

```dataview
LIST
FROM "Adora/Digests"
WHERE contains(file.name, "Customer Asks")
SORT file.mtime DESC
LIMIT 10
```
