## sql
1. **Default to `SECURITY INVOKER`:**
   - Functions should run with the permissions of the user invoking the function.
   - Use `SECURITY DEFINER` only when required. There should be a comment explaining why its required.
2. **Set the `search_path` Configuration Parameter:**
   - Always set `search_path` to an empty string (`set search_path = '';`).
   - Use fully qualified names (e.g., `schema_name.table_name`) for all database objects referenced within the function.
## Best Practices
1. **Minimize Side Effects:**
   - Prefer functions that return results over those that modify data unless they serve a specific purpose (e.g., triggers).
2. **Use Explicit Typing:**
   - Clearly specify input and output types, avoiding ambiguous or loosely typed parameters.
3. **Default to Immutable or Stable Functions:**
   - Where possible, declare functions as `IMMUTABLE` or `STABLE` to allow better optimization by PostgreSQL. Use `VOLATILE` only if the function modifies data or has side effects. If a function is not `IMMUTABLE` or `STABLE` there should be a comment specifying why.
4. **Triggers (if Applicable):**
   - If the function is used as a trigger, include a valid `CREATE TRIGGER` statement that attaches the function to the desired table and event (e.g., `BEFORE INSERT`).