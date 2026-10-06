import { useState, type FormEvent } from "react";
import { useLotStore } from "../store/useLotStore";

/**
 * The console's front door.
 *
 * A single centred card on the ambient background: brand mark, two fields,
 * one button. Deliberately spare — it is the first thing an audience sees, so
 * it should read as "secure terminal", not "sign-up flow".
 */
export function LoginScreen() {
  const login = useLotStore((state) => state.login);
  const authenticating = useLotStore((state) => state.authenticating);
  const authError = useLotStore((state) => state.authError);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (authenticating) return;
    void login(username, password);
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={handleSubmit}>
        <div className="login__brand">
          <span className="login__mark" aria-hidden="true">
            P
          </span>
          <div>
            <p className="login__name">Apex Parking</p>
            <p className="login__role">Operations console</p>
          </div>
        </div>

        <p className="login__lede">
          Sign in to monitor the lot, take payments and authorise tows.
        </p>

        <label className="login__field">
          <span>Operator</span>
          <input
            type="text"
            name="username"
            autoComplete="username"
            autoFocus
            required
            value={username}
            disabled={authenticating}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="admin"
          />
        </label>

        <label className="login__field">
          <span>Password</span>
          <div className="login__password">
            <input
              type={revealed ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              disabled={authenticating}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
            <button
              type="button"
              className="login__reveal"
              onClick={() => setRevealed((value) => !value)}
              aria-label={revealed ? "Hide password" : "Show password"}
            >
              {revealed ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        {authError !== null && (
          <p className="login__error" role="alert">
            {authError}
          </p>
        )}

        <button className="login__submit" type="submit" disabled={authenticating}>
          {authenticating && <span className="spinner" aria-hidden="true" />}
          {authenticating ? "Signing in…" : "Sign in"}
        </button>

        <p className="login__foot">Restricted facility — authorised operators only.</p>
      </form>
    </div>
  );
}