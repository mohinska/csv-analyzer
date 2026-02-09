import svgPaths from "./svg-qs0u4mu7o5";

function Mask() {
  return (
    <div className="absolute bg-white inset-[-50px_-50px_-10px_-50px]" data-name="Mask">
      <div className="absolute bg-black inset-[76px] rounded-[318px]" data-name="Shape" />
    </div>
  );
}

function Blur1() {
  return <div className="absolute backdrop-blur-[40px] bg-[rgba(0,0,0,0.08)] blur-[20px] inset-[31px_26px_21px_26px] mix-blend-hard-light rounded-[18px]" data-name="Blur" />;
}

function Blur() {
  return (
    <div className="absolute inset-[-26px]" data-name="Blur">
      <Mask />
      <Blur1 />
    </div>
  );
}

function Fill() {
  return (
    <div className="absolute inset-0 rounded-[18px]" data-name="Fill">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-[18px]">
        <div className="absolute bg-[#262626] inset-0 mix-blend-color-dodge rounded-[18px]" />
        <div className="absolute bg-[rgba(245,245,245,0.67)] inset-0 rounded-[18px]" />
      </div>
    </div>
  );
}

function Group() {
  return (
    <div className="absolute contents inset-0" data-name="Group">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <path d="M18 0H0V13.8363H18V0Z" fill="var(--fill-0, black)" id="Vector" opacity="0" />
      </svg>
      <div className="absolute inset-[0_1.55%_0_0]" data-name="Vector">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 17.7219 13.8363">
          <path d={svgPaths.p23022f80} fill="var(--fill-0, black)" fillOpacity="0.85" id="Vector" />
        </svg>
      </div>
    </div>
  );
}

function Tablecells() {
  return (
    <div className="aspect-[23.388700485229492/17.978500366210938] flex-[1_0_0] min-h-px min-w-px overflow-clip relative" data-name="tablecells 1">
      <Group />
    </div>
  );
}

function Frame2() {
  return (
    <div className="content-stretch flex items-center justify-between relative shrink-0 w-[18px]" data-name="Frame">
      <Tablecells />
    </div>
  );
}

function Frame1() {
  return (
    <div className="bg-[rgba(0,0,0,0.1)] flex-[1_0_0] h-full min-h-px min-w-px relative rounded-[8px]" data-name="Frame">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[6px] items-center pl-[8px] pr-[10px] py-[4px] relative size-full">
          <Frame2 />
          <div className="flex flex-[1_0_0] flex-col font-['SF_Pro:Medium',sans-serif] font-[510] h-[16px] justify-center leading-[0] min-h-px min-w-px overflow-hidden relative text-[11px] text-[rgba(0,0,0,0.85)] text-ellipsis whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
            <p className="leading-[16px] overflow-hidden">Data</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Item() {
  return (
    <div className="flex-[1_0_0] h-[24px] min-h-px min-w-px relative rounded-[5px]" data-name="Item">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center px-[10px] relative size-full">
          <Frame1 />
        </div>
      </div>
    </div>
  );
}

function Group1() {
  return (
    <div className="absolute contents inset-0" data-name="Group">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <path d="M18 0H0V13.1614H18V0Z" fill="var(--fill-0, black)" id="Vector" opacity="0" />
      </svg>
      <div className="absolute inset-[0_1.44%_0.11%_69.78%]" data-name="Vector">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 5.18076 13.1474">
          <path d={svgPaths.p33927000} fill="var(--fill-0, black)" fillOpacity="0.85" id="Vector" />
        </svg>
      </div>
      <div className="absolute inset-[15.49%_36.35%_0.11%_34.87%]" data-name="Vector">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 5.18076 11.1086">
          <path d={svgPaths.pdce8180} fill="var(--fill-0, black)" fillOpacity="0.85" id="Vector" />
        </svg>
      </div>
      <div className="absolute inset-[30.93%_71.22%_0.11%_0]" data-name="Vector">
        <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 5.18075 9.07682">
          <path d={svgPaths.p9859a00} fill="var(--fill-0, black)" fillOpacity="0.85" id="Vector" />
        </svg>
      </div>
    </div>
  );
}

function ChartBar() {
  return (
    <div className="aspect-[25.175800323486328/18.408199310302734] flex-[1_0_0] min-h-px min-w-px overflow-clip relative" data-name="chart.bar 1">
      <Group1 />
    </div>
  );
}

function Frame4() {
  return (
    <div className="content-stretch flex items-center justify-between relative shrink-0 w-[18px]" data-name="Frame">
      <ChartBar />
    </div>
  );
}

function Frame3() {
  return (
    <div className="flex-[1_0_0] h-full min-h-px min-w-px relative rounded-[8px]" data-name="Frame">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[6px] items-center pl-[8px] pr-[10px] py-[4px] relative size-full">
          <Frame4 />
          <div className="flex flex-[1_0_0] flex-col font-['SF_Pro:Medium',sans-serif] font-[510] h-[16px] justify-center leading-[0] min-h-px min-w-px overflow-hidden relative text-[11px] text-[rgba(0,0,0,0.85)] text-ellipsis whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
            <p className="leading-[16px] overflow-hidden">Plots</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Item1() {
  return (
    <div className="flex-[1_0_0] h-[24px] min-h-px min-w-px relative rounded-[5px]" data-name="Item">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center px-[10px] relative size-full">
          <Frame3 />
        </div>
      </div>
    </div>
  );
}

function Frame({ className }: { className?: string }) {
  return (
    <div className={className || "content-stretch flex items-start py-[10px] relative shrink-0 w-[189px]"} data-name="Frame">
      <Item />
      <Item1 />
    </div>
  );
}

function Example() {
  return (
    <div className="content-stretch flex items-start relative shrink-0 w-full" data-name="Example">
      <Blur />
      <Fill />
      <Frame />
    </div>
  );
}

function Mask1() {
  return (
    <div className="absolute bg-white inset-[-50px]" data-name="Mask">
      <div className="absolute bg-black inset-[76px] rounded-[318px]" data-name="Shape" />
    </div>
  );
}

function Blur3() {
  return <div className="absolute backdrop-blur-[40px] bg-[rgba(0,0,0,0.08)] blur-[20px] inset-[31px_26px_21px_26px] mix-blend-hard-light rounded-[18px]" data-name="Blur" />;
}

function Blur2() {
  return (
    <div className="absolute inset-[-26px]" data-name="Blur">
      <Mask1 />
      <Blur3 />
    </div>
  );
}

function Fill1() {
  return (
    <div className="absolute inset-0 rounded-[18px]" data-name="Fill">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-[18px]">
        <div className="absolute bg-[#262626] inset-0 mix-blend-color-dodge rounded-[18px]" />
        <div className="absolute bg-[rgba(245,245,245,0.67)] inset-0 rounded-[18px]" />
      </div>
    </div>
  );
}

function Black() {
  return <div className="absolute bg-black inset-0 opacity-5" data-name="Black" />;
}

function PulldownButton() {
  return (
    <div className="content-stretch flex gap-[8px] h-[24px] items-center overflow-clip pl-[12px] relative rounded-[6px] shrink-0 w-[100px]" data-name="Pulldown Button">
      <Black />
      <div className="flex flex-[1_0_0] flex-col font-['SF_Pro:Medium',sans-serif] font-[510] h-full justify-center leading-[0] min-h-px min-w-px overflow-hidden relative text-[13px] text-[rgba(0,0,0,0.85)] text-ellipsis whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[normal] overflow-hidden">Version</p>
      </div>
      <div className="flex flex-col font-['SF_Pro:Bold',sans-serif] font-bold justify-center leading-[0] relative shrink-0 size-[24px] text-[10px] text-[rgba(0,0,0,0.85)] text-center" style={{ fontVariationSettings: "'wdth' 100" }}>
        <p className="leading-[16px] whitespace-pre-wrap">􀆈</p>
      </div>
    </div>
  );
}

function Border() {
  return <div className="absolute bg-white inset-0 mix-blend-multiply rounded-[1000px] shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08)]" data-name="Border" />;
}

function Fill2() {
  return <div className="absolute bg-white inset-0 rounded-[1000px]" data-name="Fill" />;
}

function Bg() {
  return (
    <div className="absolute inset-0 rounded-[6px]" data-name="BG">
      <Border />
      <Fill2 />
    </div>
  );
}

function MagnifyingGlass() {
  return (
    <div className="h-[15px] relative shrink-0 w-[16px]" data-name="Magnifying Glass">
      <div className="absolute flex flex-col font-['SF_Pro_Rounded:Medium',sans-serif] inset-0 justify-center leading-[0] not-italic text-[13px] text-black text-center">
        <p className="leading-[15px] whitespace-pre-wrap">􀊫</p>
      </div>
    </div>
  );
}

function Clear() {
  return <div className="h-[15px] shrink-0 w-[16px]" data-name="Clear" />;
}

function SearchField() {
  return (
    <div className="flex-[1_0_0] h-[24px] min-h-px min-w-px relative" data-name="Search Field">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[2px] items-center pl-[8px] pr-[4px] relative size-full">
          <Bg />
          <MagnifyingGlass />
          <p className="flex-[1_0_0] font-['SF_Pro:Medium',sans-serif] font-[510] leading-[16px] min-h-px min-w-px overflow-hidden relative text-[#4c4c4c] text-[13px] text-ellipsis whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
            Search
          </p>
          <Clear />
        </div>
      </div>
    </div>
  );
}

function Frame6() {
  return (
    <div className="relative shrink-0 w-full">
      <div className="content-stretch flex gap-[50px] items-start px-[20px] relative w-full">
        <PulldownButton />
        <SearchField />
      </div>
    </div>
  );
}

function LabelRightDetail() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Label + Right Detail">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center leading-[0] pl-[48px] pr-[6px] relative size-full">
          <div className="flex flex-[1_0_0] flex-col font-['SF_Pro:Bold',sans-serif] font-bold h-full justify-center min-h-px min-w-px overflow-hidden relative text-[11px] text-[rgba(0,0,0,0.85)] text-ellipsis whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
            <p className="leading-[14px] overflow-hidden">Label</p>
          </div>
          <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] h-full justify-center relative shrink-0 text-[9px] text-[rgba(0,0,0,0.5)] text-center w-[13px]" style={{ fontVariationSettings: "'wdth' 100" }}>
            <p className="leading-[13px] whitespace-pre-wrap">􀆈</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColumnHeader() {
  return (
    <div className="content-stretch flex flex-col h-[28px] items-center justify-center pb-[5px] pt-[4px] relative shrink-0 w-[150px]" data-name="Column Header">
      <div aria-hidden="true" className="absolute border-[rgba(0,0,0,0.05)] border-b border-solid inset-0 pointer-events-none" />
      <LabelRightDetail />
    </div>
  );
}

function LabelRightDetail1() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Label + Right Detail">
      <div aria-hidden="true" className="absolute border-[rgba(0,0,0,0.1)] border-l border-solid inset-0 pointer-events-none" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center leading-[0] pl-[8px] pr-[6px] relative size-full">
          <div className="flex flex-[1_0_0] flex-col font-['SF_Pro:Bold',sans-serif] font-bold h-full justify-center min-h-px min-w-px overflow-hidden relative text-[11px] text-[rgba(0,0,0,0.85)] text-ellipsis whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
            <p className="leading-[14px] overflow-hidden">Label</p>
          </div>
          <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] h-full justify-center relative shrink-0 text-[9px] text-[rgba(0,0,0,0.5)] text-center w-[13px]" style={{ fontVariationSettings: "'wdth' 100" }}>
            <p className="leading-[13px] whitespace-pre-wrap">􀆈</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColumnHeader1() {
  return (
    <div className="content-stretch flex flex-col h-[28px] items-center justify-center pb-[5px] pt-[4px] relative shrink-0 w-[150px]" data-name="Column Header">
      <div aria-hidden="true" className="absolute border-[rgba(0,0,0,0.05)] border-b border-solid inset-0 pointer-events-none" />
      <LabelRightDetail1 />
    </div>
  );
}

function LabelRightDetail2() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative w-full" data-name="Label + Right Detail">
      <div aria-hidden="true" className="absolute border-[rgba(0,0,0,0.1)] border-l border-solid inset-0 pointer-events-none" />
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center leading-[0] pl-[8px] pr-[6px] relative size-full">
          <div className="flex flex-[1_0_0] flex-col font-['SF_Pro:Bold',sans-serif] font-bold h-full justify-center min-h-px min-w-px overflow-hidden relative text-[11px] text-[rgba(0,0,0,0.85)] text-ellipsis whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
            <p className="leading-[14px] overflow-hidden">Label</p>
          </div>
          <div className="flex flex-col font-['SF_Pro:Medium',sans-serif] font-[510] h-full justify-center relative shrink-0 text-[9px] text-[rgba(0,0,0,0.5)] text-center w-[13px]" style={{ fontVariationSettings: "'wdth' 100" }}>
            <p className="leading-[13px] whitespace-pre-wrap">􀆈</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColumnHeader2() {
  return (
    <div className="content-stretch flex flex-col h-[28px] items-center justify-center pb-[5px] pt-[4px] relative shrink-0 w-[150px]" data-name="Column Header">
      <div aria-hidden="true" className="absolute border-[rgba(0,0,0,0.05)] border-b border-solid inset-0 pointer-events-none" />
      <LabelRightDetail2 />
    </div>
  );
}

function Frame5() {
  return (
    <div className="content-stretch flex items-center relative shrink-0">
      <ColumnHeader />
      <ColumnHeader1 />
      <ColumnHeader2 />
    </div>
  );
}

function Example1() {
  return (
    <div className="content-stretch flex flex-col gap-[10px] h-[890px] items-start py-[20px] relative shrink-0 w-full" data-name="Example">
      <Blur2 />
      <Fill1 />
      <Frame6 />
      <Frame5 />
    </div>
  );
}

function Frame7() {
  return (
    <div className="content-stretch flex flex-col gap-[10px] items-start justify-center relative shrink-0">
      <Example />
      <Example1 />
    </div>
  );
}

function Mask2() {
  return (
    <div className="absolute bg-white inset-[-50px]" data-name="Mask">
      <div className="absolute bg-black inset-[76px] rounded-[318px]" data-name="Shape" />
    </div>
  );
}

function Blur5() {
  return <div className="absolute backdrop-blur-[40px] bg-[rgba(0,0,0,0.08)] blur-[20px] inset-[31px_26px_21px_26px] mix-blend-hard-light rounded-[18px]" data-name="Blur" />;
}

function Blur4() {
  return (
    <div className="absolute inset-[-26px]" data-name="Blur">
      <Mask2 />
      <Blur5 />
    </div>
  );
}

function Fill3() {
  return (
    <div className="absolute inset-0 rounded-[18px]" data-name="Fill">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-[18px]">
        <div className="absolute bg-[#262626] inset-0 mix-blend-color-dodge rounded-[18px]" />
        <div className="absolute bg-[rgba(245,245,245,0.67)] inset-0 rounded-[18px]" />
      </div>
    </div>
  );
}

function Frame8() {
  return (
    <div className="relative shrink-0 w-full">
      <div className="content-stretch flex items-start px-[20px] relative w-full">
        <div className="flex flex-[1_0_0] flex-col font-['SF_Pro:Semibold',sans-serif] font-[590] justify-center leading-[0] min-h-px min-w-px overflow-hidden relative self-stretch text-[18px] text-[rgba(0,0,0,0.85)] text-ellipsis whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
          <p className="leading-[normal] overflow-hidden">AI Data Analyzer</p>
        </div>
      </div>
    </div>
  );
}

function Border1() {
  return <div className="absolute bg-white inset-0 mix-blend-multiply rounded-[1000px] shadow-[0px_0px_0px_1px_rgba(0,0,0,0.08)]" data-name="Border" />;
}

function Fill4() {
  return <div className="absolute bg-white inset-0 rounded-[1000px]" data-name="Fill" />;
}

function Bg1() {
  return (
    <div className="absolute inset-0 rounded-[6px]" data-name="BG">
      <Border1 />
      <Fill4 />
    </div>
  );
}

function Mask3() {
  return (
    <div className="absolute bg-white inset-[-50px]" data-name="Mask">
      <div className="absolute bg-black inset-[76px] rounded-[1000px]" data-name="Shape" />
    </div>
  );
}

function Blur7() {
  return <div className="absolute backdrop-blur-[20px] bg-[rgba(0,0,0,0.1)] blur-[10px] inset-[28px_26px_24px_26px] mix-blend-hard-light rounded-[1000px]" data-name="Blur" />;
}

function Blur6() {
  return (
    <div className="absolute inset-[-26px] opacity-67" data-name="Blur">
      <Mask3 />
      <Blur7 />
    </div>
  );
}

function Fill5() {
  return (
    <div className="absolute inset-0 rounded-[296px]" data-name="Fill">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-[296px]">
        <div className="absolute bg-[#333] inset-0 mix-blend-color-dodge rounded-[296px]" />
        <div className="absolute inset-0 rounded-[296px]" style={{ backgroundImage: "linear-gradient(90deg, rgb(247, 247, 247) 0%, rgb(247, 247, 247) 100%), linear-gradient(90deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.5) 100%)" }} />
      </div>
    </div>
  );
}

function GlassEffect() {
  return <div className="absolute bg-[rgba(0,0,0,0)] inset-0 rounded-[296px]" data-name="Glass Effect" />;
}

function ArrowUp() {
  return (
    <div className="h-[18.447px] overflow-clip relative shrink-0 w-[15.166px]" data-name="arrow.up 1">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15.166 18.4473">
        <g id="Group">
          <path d={svgPaths.p5e80200} fill="var(--fill-0, #8E8E93)" id="Vector" opacity="0" />
          <path d={svgPaths.p3ace7200} fill="var(--fill-0, #8E8E93)" id="Vector_2" />
        </g>
      </svg>
    </div>
  );
}

function Button() {
  return (
    <div className="content-stretch flex h-[28px] items-center justify-center min-w-[28px] px-[4px] relative rounded-[100px] shrink-0" data-name="Button 1">
      <ArrowUp />
    </div>
  );
}

function WindowButton() {
  return (
    <div className="content-stretch flex gap-[4px] items-center p-[4px] relative shrink-0" data-name="Window/Button">
      <Blur6 />
      <Fill5 />
      <GlassEffect />
      <Button />
    </div>
  );
}

function SearchField1() {
  return (
    <div className="flex-[1_0_0] min-h-px min-w-px relative" data-name="Search Field">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex gap-[2px] items-center px-[24px] py-[10px] relative w-full">
          <Bg1 />
          <p className="flex-[1_0_0] font-['SF_Pro:Medium',sans-serif] font-[510] leading-[16px] min-h-px min-w-px overflow-hidden relative text-[#4c4c4c] text-[13px] text-ellipsis whitespace-nowrap" style={{ fontVariationSettings: "'wdth' 100" }}>
            Ask anything
          </p>
          <WindowButton />
        </div>
      </div>
    </div>
  );
}

function Mask4() {
  return (
    <div className="absolute bg-white inset-[-50px]" data-name="Mask">
      <div className="absolute bg-black inset-[76px] rounded-[1000px]" data-name="Shape" />
    </div>
  );
}

function Blur9() {
  return <div className="absolute backdrop-blur-[20px] bg-[rgba(0,0,0,0.1)] blur-[10px] inset-[28px_26px_24px_26px] mix-blend-hard-light rounded-[1000px]" data-name="Blur" />;
}

function Blur8() {
  return (
    <div className="absolute inset-[-26px] opacity-67" data-name="Blur">
      <Mask4 />
      <Blur9 />
    </div>
  );
}

function Fill6() {
  return (
    <div className="absolute inset-0 rounded-[296px]" data-name="Fill">
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none rounded-[296px]">
        <div className="absolute bg-[#333] inset-0 mix-blend-color-dodge rounded-[296px]" />
        <div className="absolute inset-0 rounded-[296px]" style={{ backgroundImage: "linear-gradient(90deg, rgb(247, 247, 247) 0%, rgb(247, 247, 247) 100%), linear-gradient(90deg, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0.5) 100%)" }} />
      </div>
    </div>
  );
}

function GlassEffect1() {
  return <div className="absolute bg-[rgba(0,0,0,0)] inset-0 rounded-[296px]" data-name="Glass Effect" />;
}

function Paperclip() {
  return (
    <div className="h-[17px] overflow-clip relative shrink-0 w-[15px]" data-name="paperclip 1">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 15 17">
        <g id="Group">
          <path d="M15 0H0V17H15V0Z" fill="var(--fill-0, #8E8E93)" id="Vector" opacity="0" />
          <path d={svgPaths.p27aa9670} fill="var(--fill-0, #8E8E93)" id="Vector_2" />
        </g>
      </svg>
    </div>
  );
}

function Button1() {
  return (
    <div className="content-stretch flex h-full items-center justify-center min-h-[28px] min-w-[28px] px-[4px] relative rounded-[100px] shrink-0 w-[28px]" data-name="Button 1">
      <Paperclip />
    </div>
  );
}

function WindowButton1() {
  return (
    <div className="content-stretch flex gap-[4px] items-center p-[7px] relative shrink-0" data-name="Window/Button">
      <Blur8 />
      <Fill6 />
      <GlassEffect1 />
      <div className="flex flex-row items-center self-stretch">
        <Button1 />
      </div>
    </div>
  );
}

function Frame9() {
  return (
    <div className="relative shrink-0 w-full">
      <div className="flex flex-row items-center justify-center size-full">
        <div className="content-stretch flex gap-[10px] items-center justify-center px-[20px] relative w-full">
          <SearchField1 />
          <WindowButton1 />
        </div>
      </div>
    </div>
  );
}

function Example2() {
  return (
    <div className="content-stretch flex flex-[1_0_0] flex-col h-full items-start justify-between min-h-px min-w-px py-[14px] relative" data-name="Example">
      <Blur4 />
      <Fill3 />
      <Frame8 />
      <Frame9 />
    </div>
  );
}

export default function Main() {
  return (
    <div className="bg-white content-stretch flex gap-[10px] items-center p-[40px] relative size-full" data-name="main">
      <Frame7 />
      <Example2 />
    </div>
  );
}