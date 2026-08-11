export type Golden = {
  id: string;
  category: string;
  query: string;
  expected_route: "sql" | "vector" | "hybrid" | "refuse";
  expected_tools: string[];
  required_restaurant_slugs: string[];
  acceptable_restaurant_slugs: string[];
  forbidden_restaurant_slugs: string[];
  required_facts: string[];
  golden_answer: string;
  grading_rubric: {
    must_mention: string[];
    must_not_claim: string[];
    must_cite: boolean;
  };
  difficulty: "easy" | "medium" | "hard";
  notes: string;
};

export type CheckResult = {
  pass: boolean;
  detail: string;
};

export type GoldenResult = {
  id: string;
  category: string;
  difficulty: string;
  query: string;
  answer: string;
  toolsCalled: string[];
  routeActual: string;
  routeExpected: string;
  checks: {
    route: CheckResult;
    retrieval: CheckResult;
    rubric: CheckResult;
  };
  pass: boolean;
  error?: string;
};
