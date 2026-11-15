import * as vscode from "vscode";
import { Stats } from "../types";

const KEY = {
  day: "bsc.day",
  sweat: "bsc.sweat",
  blood: "bsc.blood",
  code: "bsc.code",
  goalReached: "bsc.goalReached"
};

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Daily counters that reset at local midnight. */
export class StatsService {
  private day: string;
  private sweat: number;
  private blood: number;
  private code: number;
  private goalReached: boolean;

  constructor(private readonly context: vscode.ExtensionContext, private goal: number) {
    const g = context.globalState;
    this.day = g.get<string>(KEY.day, today());
    this.sweat = g.get<number>(KEY.sweat, 0);
    this.blood = g.get<number>(KEY.blood, 0);
    this.code = g.get<number>(KEY.code, 0);
    this.goalReached = g.get<boolean>(KEY.goalReached, false);
    this.rollover();
  }

  get snapshot(): Stats {
    this.rollover();
    return { sweat: this.sweat, blood: this.blood, code: this.code, goal: this.goal, goalReached: this.goalReached };
  }

  setGoal(goal: number) {
    this.goal = Math.max(1, goal);
  }

  /** +1 keystroke. Returns true when a multiple of 1000 was just reached. */
  addSweat(): boolean {
    this.rollover();
    this.sweat += 1;
    void this.context.globalState.update(KEY.sweat, this.sweat);
    return this.sweat % 1000 === 0;
  }

  addBlood(n: number) {
    this.rollover();
    this.blood += n;
    void this.context.globalState.update(KEY.blood, this.blood);
  }

  /** Adds lines written. Returns true the first time today's goal is reached. */
  addCode(lines: number): boolean {
    this.rollover();
    this.code += lines;
    void this.context.globalState.update(KEY.code, this.code);
    if (!this.goalReached && this.code >= this.goal) {
      this.goalReached = true;
      void this.context.globalState.update(KEY.goalReached, true);
      return true;
    }
    return false;
  }

  reset() {
    this.sweat = 0;
    this.blood = 0;
    this.code = 0;
    this.goalReached = false;
    this.day = today();
    this.persistAll();
  }

  private rollover() {
    if (this.day !== today()) {
      this.reset();
    }
  }

  private persistAll() {
    const g = this.context.globalState;
    void g.update(KEY.day, this.day);
    void g.update(KEY.sweat, this.sweat);
    void g.update(KEY.blood, this.blood);
    void g.update(KEY.code, this.code);
    void g.update(KEY.goalReached, this.goalReached);
  }
}
