import { Annotation, StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { retrieveCatalogCandidates, CandidateProduct } from "./catalog.agent.js";
import { evaluateCandidates, RecommendationResult } from "./recommendation.agent.js";
import { evaluateOfferPolicy } from "./offer.agent.js";

// 1. Define the Graph State
export const CommerceState = Annotation.Root({
  userMessage: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  budget: Annotation<number | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  candidates: Annotation<CandidateProduct[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  recommendation: Annotation<RecommendationResult | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  growthOffer: Annotation<any | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  policyValidation: Annotation<any | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  needsApproval: Annotation<boolean>({
    reducer: (x, y) => y ?? x,
    default: () => false,
  }),
});

// 2. Define the Agent Nodes
async function catalogNode(state: typeof CommerceState.State) {
  console.log("--> [Catalog Agent] Searching database...");
  const candidates = await retrieveCatalogCandidates({
    query: state.userMessage,
    maxPrice: state.budget,
    limit: 5,
  });
  return { candidates };
}

async function recommendationNode(state: typeof CommerceState.State) {
  console.log("--> [Recommendation Agent] Evaluating options...");
  const recommendation = await evaluateCandidates(state.userMessage, state.candidates);
  return { recommendation };
}

async function growthNode(state: typeof CommerceState.State) {
  console.log("--> [Growth Agent] Checking for upsells...");
  if (state.recommendation?.recommendedProduct) {
    return { 
      growthOffer: { 
        title: "Add Premium Case", 
        price: 999, 
        discountedFrom: 1499 
      } 
    };
  }
  return { growthOffer: null };
}

async function offerNode(state: typeof CommerceState.State) {
  console.log("--> [Offer/Policy Agent] Validating offer boundaries...");
  const productPrice = state.recommendation?.recommendedProduct?.price 
    ? Number(state.recommendation.recommendedProduct.price) 
    : 0;

  const evaluation = await evaluateOfferPolicy(state.growthOffer, productPrice);
  
  return { 
    growthOffer: evaluation.adjustedOffer,
    policyValidation: {
      approved: evaluation.approved,
      reason: evaluation.policyReason
    }
  };
}

async function paymentNode(state: typeof CommerceState.State) {
  console.log("--> [Payment Agent] Halting for user approval...");
  return { needsApproval: true };
}

// 3. Initialize MemorySaver Checkpointer
const checkpointer = new MemorySaver();

const workflow = new StateGraph(CommerceState)
  .addNode("catalog", catalogNode)
  .addNode("recommendationAgent", recommendationNode)
  .addNode("growth", growthNode)
  .addNode("offerAgent", offerNode)
  .addNode("payment", paymentNode)

  .addEdge(START, "catalog")
  .addEdge("catalog", "recommendationAgent")
  .addEdge("recommendationAgent", "growth")
  .addEdge("growth", "offerAgent")
  .addEdge("offerAgent", "payment")
  .addEdge("payment", END);

// Compile graph with the in-memory checkpointer and breakpoint
export const commerceGraph = workflow.compile({
  checkpointer,
  interruptBefore: ["payment"], 
});

export const runCommerceGraph = async (message: string, budget?: number, threadId: string = "default-session") => {
  console.log(`\n🚀 Starting Memory-Checkpointed Run (Thread: ${threadId}) for: "${message}"`);
  
  const initialState = {
    userMessage: message,
    budget: budget,
  };

  const config = { configurable: { thread_id: threadId } };
  const finalState = await commerceGraph.invoke(initialState, config);
  return finalState;
};