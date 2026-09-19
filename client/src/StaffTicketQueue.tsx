import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import {
  ApiRequestError,
  fetchCategories,
  fetchRelatedSystems,
  fetchStaffTickets,
  type Category,
  type CurrentStatus,
  type RelatedSystem,
  type RequestedPriority,
  type StaffAssignment,
  type StaffSortField,
  type StaffTicket,
  type StaffTicketQuery,
  type TicketListMeta,
  type TicketPageSize,
  type TicketSortOrder,
} from "./api.js";

interface StaffTicketQueueProps {
  onOpenTicket?: (ticketId: number) => void;
}

type QueueState = "loading" | "success" | "error";
type ReferenceState = "loading" | "success" | "error";

interface QueueFilters {
  search: string;
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: "" | RequestedPriority;
  itPriority: "" | RequestedPriority;
  currentStatus: "" | CurrentStatus;
  assignment: StaffAssignment;
  sortBy: StaffSortField;
  sortOrder: TicketSortOrder;
}

const INITIAL_FILTERS: QueueFilters = {
  search: "",
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  itPriority: "",
  currentStatus: "",
  assignment: "all",
  sortBy: "updatedAt",
  sortOrder: "desc",
};

const PAGE_SIZES: TicketPageSize[] = [10, 20, 50];
const PRIORITIES: RequestedPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES: CurrentStatus[] = [
  "NEW",
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_REQUESTER",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
];

const SORT_OPTIONS: Array<{ value: StaffSortField; label: string }> = [
  { value: "updatedAt", label: "Last Updated" },
  { value: "ticketNumber", label: "Ticket Number" },
  { value: "ticketDate", label: "Created Date" },
  { value: "category", label: "Category" },
  { value: "requestedPriority", label: "Requested Priority" },
  { value: "itPriority", label: "IT Priority" },
  { value: "currentStatus", label: "Current Status" },
  { value: "ticketOwner", label: "Ticket Owner" },
];

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatPriority(value: RequestedPriority): string {
  return value[0] + value.slice(1).toLowerCase();
}

function formatStatus(value: CurrentStatus): string {
  const labels: Record<CurrentStatus, string> = {
    NEW: "New",
    OPEN: "Open",
    IN_PROGRESS: "In Progress",
    WAITING_FOR_REQUESTER: "Waiting for Requester",
    RESOLVED: "Resolved",
    CLOSED: "Closed",
    REOPENED: "Reopened",
    CANCELLED: "Cancelled",
  };
  return labels[value];
}

function getPageSummary(meta: TicketListMeta): string {
  if (meta.totalItems === 0) return "0 Tickets";
  const first = (meta.page - 1) * meta.pageSize + 1;
  const last = Math.min(meta.page * meta.pageSize, meta.totalItems);
  return `Showing ${first}–${last} of ${meta.totalItems} Tickets`;
}

function safeQueueError(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 403) {
    return "You are not allowed to view the IT Staff Ticket Queue.";
  }
  if (!(error instanceof ApiRequestError) || error.message.length === 0) {
    return "Unable to load the Ticket Queue. Please try again.";
  }
  return /\b(sql|select|insert|update|delete|password|secret|stack|trace|prisma|node_modules)\b/iu.test(
    error.message,
  )
    ? "Unable to load the Ticket Queue. Please try again."
    : error.message;
}

function isFiltered(filters: QueueFilters): boolean {
  return (
    filters.search.trim().length > 0 ||
    filters.categoryId !== "" ||
    filters.relatedSystemId !== "" ||
    filters.requestedPriority !== "" ||
    filters.itPriority !== "" ||
    filters.currentStatus !== "" ||
    filters.assignment !== "all"
  );
}

export default function StaffTicketQueue({ onOpenTicket }: StaffTicketQueueProps) {
  const [filters, setFilters] = useState<QueueFilters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TicketPageSize>(10);
  const [queueState, setQueueState] = useState<QueueState>("loading");
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueResult, setQueueResult] = useState<{
    data: StaffTicket[];
    meta: TicketListMeta;
  } | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [referenceState, setReferenceState] = useState<ReferenceState>("loading");
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [queueRetry, setQueueRetry] = useState(0);
  const [referenceRetry, setReferenceRetry] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useMemo<StaffTicketQuery>(
    () => ({
      search: filters.search,
      categoryId: filters.categoryId === "" ? null : Number(filters.categoryId),
      relatedSystemId:
        filters.relatedSystemId === "" ? null : Number(filters.relatedSystemId),
      requestedPriority:
        filters.requestedPriority === "" ? null : filters.requestedPriority,
      itPriority: filters.itPriority === "" ? null : filters.itPriority,
      currentStatus: filters.currentStatus === "" ? null : filters.currentStatus,
      assignment: filters.assignment,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      page,
      pageSize,
    }),
    [filters, page, pageSize],
  );
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    const controller = new AbortController();
    setReferenceState("loading");
    setReferenceError(null);
    Promise.all([fetchCategories(controller.signal), fetchRelatedSystems(controller.signal)])
      .then(([loadedCategories, loadedRelatedSystems]) => {
        setCategories(loadedCategories);
        setRelatedSystems(loadedRelatedSystems);
        setReferenceState("success");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setReferenceState("error");
        setReferenceError("Unable to load queue filter references. Please try again.");
      });
    return () => controller.abort();
  }, [referenceRetry]);

  useEffect(() => {
    const controller = new AbortController();
    setQueueState("loading");
    setQueueError(null);
    fetchStaffTickets(query, controller.signal)
      .then((result) => {
        setQueueResult(result);
        setQueueState("success");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setQueueState("error");
        setQueueError(safeQueueError(error));
      });
    return () => controller.abort();
  }, [queryKey, queueRetry]);

  function updateFilter<K extends keyof QueueFilters>(field: K, value: QueueFilters[K]) {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  }

  function handleSelectChange(
    field: Exclude<keyof QueueFilters, "search">,
    event: ChangeEvent<HTMLSelectElement>,
  ) {
    updateFilter(field, event.target.value as QueueFilters[typeof field]);
  }

  function handleSortHeader(field: StaffSortField) {
    if (filters.sortBy === field) {
      updateFilter("sortOrder", filters.sortOrder === "asc" ? "desc" : "asc");
      return;
    }
    updateFilter("sortBy", field);
    updateFilter("sortOrder", field === "updatedAt" ? "desc" : "asc");
  }

  function clearFilters() {
    setFilters(INITIAL_FILTERS);
    setPage(1);
  }

  function openTicket(ticketId: number) {
    if (onOpenTicket !== undefined) {
      onOpenTicket(ticketId);
      return;
    }
    setNotice("Ticket Detail will be available in the next Issue.");
  }

  function handlePageSizeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextPageSize = Number(event.target.value);
    if (PAGE_SIZES.includes(nextPageSize as TicketPageSize)) {
      setPageSize(nextPageSize as TicketPageSize);
      setPage(1);
    }
  }

  function sortHeader(field: StaffSortField, label: string) {
    const active = filters.sortBy === field;
    return (
      <button
        type="button"
        className="zen-table-sort-button"
        aria-label={`Sort by ${label}`}
        onClick={() => handleSortHeader(field)}
      >
        {label}
        <span aria-hidden="true">
          {active ? (filters.sortOrder === "asc" ? " ↑" : " ↓") : " •"}
        </span>
      </button>
    );
  }

  function renderOwner(ticket: StaffTicket) {
    return ticket.ticketOwner === null ? (
      <span className="zen-unassigned">Unassigned</span>
    ) : (
      <span>
        {ticket.ticketOwner.displayName}
        <small className="zen-owner-role">{ticket.ticketOwner.role === "IT_STAFF" ? "IT Staff" : "Administrator"}</small>
      </span>
    );
  }

  function renderTicketCard(ticket: StaffTicket) {
    return (
      <article className="zen-ticket-card" key={ticket.id}>
        <div className="zen-ticket-card-heading">
          <span className="zen-ticket-number">{ticket.ticketNumber}</span>
          <span className="zen-badge zen-badge-status">{formatStatus(ticket.currentStatus)}</span>
        </div>
        <h2>{ticket.summary}</h2>
        <dl className="zen-ticket-card-details">
          <div><dt>Created Date</dt><dd>{formatDate(ticket.ticketDate)}</dd></div>
          <div><dt>Category</dt><dd>{ticket.category.name}</dd></div>
          <div><dt>Requester</dt><dd>{ticket.requester.displayName}</dd></div>
          <div><dt>Ticket Owner</dt><dd>{renderOwner(ticket)}</dd></div>
          <div><dt>Requested Priority</dt><dd><span className="zen-badge zen-badge-priority">{formatPriority(ticket.requestedPriority)}</span></dd></div>
          <div><dt>IT Priority</dt><dd><span className="zen-badge zen-badge-priority">{formatPriority(ticket.itPriority)}</span></dd></div>
          <div><dt>Last Updated</dt><dd>{formatDate(ticket.updatedAt)}</dd></div>
        </dl>
        <button
          type="button"
          className="zen-button zen-button-secondary zen-ticket-open-button"
          onClick={() => openTicket(ticket.id)}
          aria-label={`Open ${ticket.ticketNumber}`}
        >
          Open Ticket
        </button>
      </article>
    );
  }

  const hasFilters = isFiltered(filters);
  const tickets = queueResult?.data ?? [];
  const meta = queueResult?.meta ?? null;

  return (
    <div className="zen-staff-queue">
      <header className="zen-list-heading">
        <div>
          <p className="zen-eyebrow">IT Staff workspace</p>
          <h1>Ticket Queue</h1>
          <p className="zen-lead">Search and triage every Ticket in the system.</p>
        </div>
      </header>

      <section className="zen-ticket-toolbar zen-staff-queue-toolbar" aria-label="Ticket Queue filters and sorting">
        <div className="zen-list-field zen-list-search">
          <label htmlFor="staff-ticket-search">Search Tickets</label>
          <input
            id="staff-ticket-search"
            type="search"
            maxLength={100}
            value={filters.search}
            placeholder="Search number, summary, requester, or owner"
            onChange={(event) => updateFilter("search", event.target.value)}
          />
        </div>
        <div className="zen-list-field">
          <label htmlFor="staff-ticket-category">Category</label>
          <select id="staff-ticket-category" value={filters.categoryId} disabled={referenceState !== "success"} onChange={(event) => handleSelectChange("categoryId", event)}>
            <option value="">All Categories</option>
            {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className="zen-list-field">
          <label htmlFor="staff-ticket-system">Related System</label>
          <select id="staff-ticket-system" value={filters.relatedSystemId} disabled={referenceState !== "success"} onChange={(event) => handleSelectChange("relatedSystemId", event)}>
            <option value="">All Related Systems</option>
            {relatedSystems.map((system) => <option value={system.id} key={system.id}>{system.name}</option>)}
          </select>
        </div>
        <div className="zen-list-field">
          <label htmlFor="staff-requested-priority">Requested Priority</label>
          <select id="staff-requested-priority" value={filters.requestedPriority} onChange={(event) => handleSelectChange("requestedPriority", event)}>
            <option value="">All Requested Priorities</option>
            {PRIORITIES.map((priority) => <option value={priority} key={priority}>{formatPriority(priority)}</option>)}
          </select>
        </div>
        <div className="zen-list-field">
          <label htmlFor="staff-it-priority">IT Priority</label>
          <select id="staff-it-priority" value={filters.itPriority} onChange={(event) => handleSelectChange("itPriority", event)}>
            <option value="">All IT Priorities</option>
            {PRIORITIES.map((priority) => <option value={priority} key={priority}>{formatPriority(priority)}</option>)}
          </select>
        </div>
        <div className="zen-list-field">
          <label htmlFor="staff-status">Current Status</label>
          <select id="staff-status" value={filters.currentStatus} onChange={(event) => handleSelectChange("currentStatus", event)}>
            <option value="">All Current Statuses</option>
            {STATUSES.map((status) => <option value={status} key={status}>{formatStatus(status)}</option>)}
          </select>
        </div>
        <div className="zen-list-field">
          <label htmlFor="staff-assignment">Assignment</label>
          <select id="staff-assignment" value={filters.assignment} onChange={(event) => handleSelectChange("assignment", event)}>
            <option value="all">All Assignments</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
            <option value="mine">Mine</option>
          </select>
        </div>
        <div className="zen-list-field">
          <label htmlFor="staff-sort-by">Sort By</label>
          <select id="staff-sort-by" value={filters.sortBy} onChange={(event) => handleSelectChange("sortBy", event)}>
            {SORT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="zen-list-field">
          <label htmlFor="staff-sort-order">Sort Direction</label>
          <select id="staff-sort-order" value={filters.sortOrder} onChange={(event) => handleSelectChange("sortOrder", event)}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <button type="button" className="zen-button zen-button-secondary zen-clear-filters" onClick={clearFilters} disabled={!hasFilters}>
          Clear Filters
        </button>
      </section>

      {referenceError !== null && (
        <div className="zen-callout zen-callout-warning" role="alert">
          {referenceError}
          <button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={() => setReferenceRetry((value) => value + 1)}>Retry</button>
        </div>
      )}
      {notice !== null && <div className="zen-callout zen-callout-info" role="status">{notice}</div>}

      {queueState === "loading" && (
        <section className="zen-ticket-skeleton" aria-busy="true" aria-live="polite">
          <div className="zen-status" role="status"><span className="zen-spinner" aria-hidden="true" /> Loading Ticket Queue…</div>
          <span /><span /><span /><span />
        </section>
      )}
      {queueState === "error" && (
        <section className="zen-callout zen-callout-error" role="alert">
          <p>{queueError}</p>
          <button type="button" className="zen-button zen-button-secondary" onClick={() => setQueueRetry((value) => value + 1)}>Retry</button>
        </section>
      )}
      {queueState === "success" && meta !== null && tickets.length === 0 && (
        <section className="zen-empty-panel" aria-live="polite">
          {meta.totalItems === 0 && !hasFilters ? (
            <>
              <h2>Queue is empty</h2>
              <p>No Tickets are available in the queue yet.</p>
            </>
          ) : (
            <>
              <h2>No Tickets match your filters</h2>
              <p>Try changing the search or filters.</p>
              <button type="button" className="zen-button zen-button-secondary" onClick={clearFilters}>Clear Filters</button>
            </>
          )}
        </section>
      )}
      {queueState === "success" && meta !== null && tickets.length > 0 && (
        <section className="zen-ticket-results" aria-label="IT Staff Ticket Queue results">
          <div className="zen-ticket-table-wrap">
            <table className="zen-ticket-table zen-staff-ticket-table">
              <caption className="zen-visually-hidden">IT Staff Ticket Queue</caption>
              <thead>
                <tr>
                  <th aria-sort={filters.sortBy === "ticketNumber" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("ticketNumber", "Ticket Number")}</th>
                  <th aria-sort={filters.sortBy === "ticketDate" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("ticketDate", "Created Date")}</th>
                  <th>Summary</th>
                  <th aria-sort={filters.sortBy === "category" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("category", "Category")}</th>
                  <th>Requester</th>
                  <th aria-sort={filters.sortBy === "requestedPriority" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("requestedPriority", "Req. Priority")}</th>
                  <th aria-sort={filters.sortBy === "itPriority" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("itPriority", "IT Priority")}</th>
                  <th aria-sort={filters.sortBy === "currentStatus" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("currentStatus", "Status")}</th>
                  <th aria-sort={filters.sortBy === "ticketOwner" ? (filters.sortOrder === "asc" ? "ascending" : "descending") : "none"}>{sortHeader("ticketOwner", "Owner")}</th>
                  <th>Last Updated</th>
                  <th><span className="zen-visually-hidden">Ticket action</span></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td><span className="zen-ticket-number">{ticket.ticketNumber}</span></td>
                    <td>{formatDate(ticket.ticketDate)}</td>
                    <td className="zen-ticket-summary">{ticket.summary}</td>
                    <td>{ticket.category.name}</td>
                    <td>{ticket.requester.displayName}</td>
                    <td><span className="zen-badge zen-badge-priority">{formatPriority(ticket.requestedPriority)}</span></td>
                    <td><span className="zen-badge zen-badge-priority">{formatPriority(ticket.itPriority)}</span></td>
                    <td><span className="zen-badge zen-badge-status">{formatStatus(ticket.currentStatus)}</span></td>
                    <td>{renderOwner(ticket)}</td>
                    <td>{formatDate(ticket.updatedAt)}</td>
                    <td><button type="button" className="zen-button zen-button-secondary zen-small-button" onClick={() => openTicket(ticket.id)} aria-label={`Open ${ticket.ticketNumber}`}>Open Ticket</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="zen-ticket-card-list">{tickets.map(renderTicketCard)}</div>
          <div className="zen-pagination" aria-label="Ticket Queue pagination">
            <p>{getPageSummary(meta)}</p>
            <div className="zen-pagination-controls">
              <button type="button" className="zen-button zen-button-secondary" disabled={!meta.hasPreviousPage} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
              <span aria-live="polite">Page {meta.page} of {meta.totalPages}</span>
              <button type="button" className="zen-button zen-button-secondary" disabled={!meta.hasNextPage} onClick={() => setPage((current) => current + 1)}>Next</button>
              <label htmlFor="staff-ticket-page-size">Page size</label>
              <select id="staff-ticket-page-size" value={pageSize} onChange={handlePageSizeChange}>{PAGE_SIZES.map((size) => <option value={size} key={size}>{size}</option>)}</select>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
