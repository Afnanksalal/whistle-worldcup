"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Squad } from "@whistle/shared";
import { api } from "../../lib/api";
import { useIdentity } from "../../lib/identity";
import { BrandMark } from "../../components/BrandMark";
import { FootballLoader } from "../../components/FootballLoader";

type SquadSummary = Pick<Squad, "id" | "name" | "createdAt"> & {
  memberCount: number;
};

type Notice = { tone: "success" | "error" | "info"; text: string };

export default function SquadsPage() {
  const router = useRouter();
  const { owner, ready, withWalletAuth } = useIdentity();
  const [squads, setSquads] = useState<SquadSummary[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await api<{ squads: SquadSummary[] }>("/squads", { signal });
    setSquads(response.squads);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setNotice({
            tone: "error",
            text: cause instanceof Error ? cause.message : "Squads could not be loaded.",
          });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [load]);

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!owner || name.trim().length < 2) return;
    setNotice(null);
    try {
      const headers = await withWalletAuth();
      const response = await api<{ squad: Squad }>("/squads", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: name.trim(), creator: owner }),
      });
      setNotice({ tone: "success", text: `${response.squad.name} is ready.` });
      setName("");
      router.push(`/squads/${response.squad.id}`);
    } catch (cause) {
      setNotice({
        tone: "error",
        text: cause instanceof Error ? cause.message : "This squad could not be created.",
      });
    }
  };

  const join = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!owner || code.trim().length < 3) return;
    setNotice(null);
    try {
      const headers = await withWalletAuth();
      const response = await api<{ squad: Squad }>("/squads/join", {
        method: "POST",
        headers,
        body: JSON.stringify({ inviteCode: code.trim(), member: owner }),
      });
      setNotice({ tone: "success", text: `You joined ${response.squad.name}.` });
      setCode("");
      router.push(`/squads/${response.squad.id}`);
    } catch (cause) {
      setNotice({
        tone: "error",
        text: cause instanceof Error ? cause.message : "That invite could not be used.",
      });
    }
  };

  return (
    <main id="main-content" className="squads-page">
      <div className="shell squads-shell">
        <header className="squads-header">
          <div>
            <p className="section-kicker">The clubhouse</p>
            <h1>Bring the group chat to matchday.</h1>
            <p>
              Start a private squad, share one invite, and see who reads the tournament best.
              Every pool settles together at full time.
            </p>
          </div>
          <ol className="squads-route" aria-label="How squads work">
            <li><span>01</span><strong>Create</strong><small>Name your room</small></li>
            <li><span>02</span><strong>Invite</strong><small>Share the code</small></li>
            <li><span>03</span><strong>Settle</strong><small>Compare at full time</small></li>
          </ol>
        </header>

        {notice && (
          <div
            className={`squads-notice is-${notice.tone}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </div>
        )}

        {!ready && (
          <div className="squads-connect-note" role="status">
            <BrandMark className="empty-brand-mark" accessibleLabel={null} />
            <p>Connect above to create a squad or use an invite.</p>
          </div>
        )}

        <section className="squad-actions" aria-label="Create or join a squad">
          <form className="squad-action-card" onSubmit={create}>
            <div className="squad-action-heading">
              <p className="section-kicker">Start a room</p>
              <h2>Create a squad</h2>
              <p>Give your matchday circle a name. You will get a private invite code next.</p>
            </div>
            <div className="squad-action-control">
              <label htmlFor="squad-name">Squad name</label>
              <input
                id="squad-name"
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Sunday Selectors"
                minLength={2}
                maxLength={48}
                autoComplete="off"
              />
              <button className="btn btn-primary" disabled={!ready || name.trim().length < 2}>
                Create squad
              </button>
            </div>
          </form>

          <form className="squad-action-card is-invite" onSubmit={join}>
            <div className="squad-action-heading">
              <p className="section-kicker">Have an invite?</p>
              <h2>Join the table</h2>
              <p>Enter the code from your squad organiser to open the room and its match pools.</p>
            </div>
            <div className="squad-action-control">
              <label htmlFor="squad-code">Invite code</label>
              <input
                id="squad-code"
                className="field mono"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="WHSTL6"
                minLength={3}
                autoCapitalize="characters"
                autoComplete="off"
              />
              <button className="btn btn-secondary" disabled={!ready || code.trim().length < 3}>
                Join squad
              </button>
            </div>
          </form>
        </section>

        <section className="squads-directory" aria-labelledby="squads-directory-title">
          <div className="squads-section-heading">
            <div>
              <p className="section-kicker">Squad rooms</p>
              <h2 id="squads-directory-title">Find your table</h2>
            </div>
            <span>{squads.length} {squads.length === 1 ? "squad" : "squads"}</span>
          </div>

          {loading ? (
            <div className="squads-loading">
              <FootballLoader label="Opening the clubhouse…" />
            </div>
          ) : squads.length ? (
            <div className="squad-list">
              {squads.map((squad) => (
                <Link key={squad.id} href={`/squads/${squad.id}`} className="squad-list-row">
                  <span className="squad-list-monogram" aria-hidden>
                    {squad.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="squad-list-name">
                    <strong>{squad.name}</strong>
                    <small>Invite required to join</small>
                  </span>
                  <span className="squad-list-meta">
                    <small>Members</small>
                    <strong>{squad.memberCount}</strong>
                  </span>
                  <span className="squad-list-meta squad-list-date">
                    <small>Opened</small>
                    <time dateTime={new Date(squad.createdAt).toISOString()}>
                      {new Date(squad.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </span>
                  <span className="squad-list-arrow" aria-hidden>→</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <strong>No squads have opened yet</strong>
              <p>Create the first room for your group and share its invite code.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
