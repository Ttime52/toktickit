-- Renaming a PostgreSQL table preserves the old Lab 1 index name. The Issue 2
-- migration also creates the contract-named unique index, so remove the
-- redundant legacy index after the rename has been applied.
DROP INDEX "Category_name_key";
